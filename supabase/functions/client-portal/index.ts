import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Espace client : lecture seule + messagerie + validation de documents
// + règlement des honoraires + échéancier complet
// + COLLECTE DE PIÈCES : le client téléverse ses documents (CIN, TF, topo…).
// v8 : documents groupés par dossier + notification à l'ouverture du portail.
// v9 : une image rangée dans un dossier de documents (ESQ, Plans, PV…)
//      apparaît dans SON dossier ; seules les photos de chantier restent
//      dans la grille « Photos ».
// v10 : frise des jalons + date de livraison (compte à rebours) +
//       commentaires épinglés sur les plans (portal_plan_comments).
// v11 : commentaires sur plans PDF — numéro de page par remarque.
// v12 : suspension d'accès (projects.portal_revoked_at) — le client voit
//       un message explicite « accès suspendu par le cabinet ».
// v13 (10/11/2026) : notifications sur le téléphone du client. Il touche
//       « Me prévenir des nouveaux documents » : son abonnement Web Push est
//       gardé dans portal_push_subscriptions (actions push_subscribe /
//       push_unsubscribe) ; send-push l'utilise quand le cabinet partage un
//       document. Avant la v13, ce fichier n'existait que sur le serveur.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "admin-docs";

// Services de notification des navigateurs (Chrome/Android, Firefox, Safari/iPhone, Edge)
const PUSH_HOTE = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
const MAX_APPAREILS = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(pathAndQuery: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: H });
  if (!r.ok) return [];
  return await r.json();
}

async function restWrite(path: string, method: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

async function findProject(token: string) {
  const projects = await rest(
    `projects?portal_token=eq.${encodeURIComponent(token)}&deleted_at=is.null&select=id,name,phase,type,tasks,client_id,budget,livraison_date,portal_revoked_at&limit=1`,
  );
  return projects[0] || null;
}

async function getClientName(project: any) {
  if (!project.client_id) return "";
  const cs = await rest(`clients?id=eq.${project.client_id}&select=name&limit=1`);
  return cs[0]?.name || "";
}

async function notifyTeam(projectId: number, projectName: string, title: string, preview: string, tag: string) {
  try {
    const team = await rest(`team_members?active=is.true&select=user_id,role,permissions`);
    const targets = (team as any[])
      .filter((m) => m.role === "admin" || m?.permissions?.is_co_admin === true)
      .map((m) => String(m.user_id));
    for (const uid of targets) {
      await restWrite("notifications", "POST", {
        user_id: uid,
        title,
        body: preview,
        type: "client_message",
        read: false,
        link_page: "project-detail",
        link_id: String(projectId),
        created_at: new Date().toISOString(),
      });
    }
    if (targets.length) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: targets, title: title.replace(/<[^>]*>/g, ""), body: preview, url: "/", tag }),
      });
    }
  } catch (_) { /* les notifications ne doivent pas bloquer */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!token || token.length < 20) return json({ error: "invalid_token" }, 400);

    const project = await findProject(token);
    if (!project) return json({ error: "not_found" }, 404);
    // Accès suspendu par le cabinet : message explicite, lecture ET écriture bloquées
    if (project.portal_revoked_at) return json({ error: "revoked" }, 403);

    // ── POST : message, validation de document, ou téléversement de pièce ──
    if (req.method === "POST") {
      let payload: any = {};
      try { payload = await req.json(); } catch (_) { /* ignore */ }

      // v13 : le téléphone du client s'abonne (ou se désabonne) aux notifications
      if (payload.action === "push_subscribe" || payload.action === "push_unsubscribe") {
        const s = payload.subscription || {};
        const endpoint = String(s.endpoint || payload.endpoint || "");
        if (endpoint.length > 1000 || !PUSH_HOTE.test(endpoint)) return json({ error: "bad_request" }, 400);
        if (payload.action === "push_unsubscribe") {
          await fetch(
            `${SUPABASE_URL}/rest/v1/portal_push_subscriptions?project_id=eq.${project.id}&endpoint=eq.${encodeURIComponent(endpoint)}`,
            { method: "DELETE", headers: H },
          );
          return json({ ok: true });
        }
        const p256dh = String(s.keys?.p256dh || "");
        const auth = String(s.keys?.auth || "");
        if (!/^[A-Za-z0-9_=-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_=-]{8,100}$/.test(auth)) return json({ error: "bad_request" }, 400);
        const deja = await rest(`portal_push_subscriptions?project_id=eq.${project.id}&select=id,endpoint&order=created_at`);
        const existe = Array.isArray(deja) && deja.some((d: any) => d.endpoint === endpoint);
        // Au-delà de 10 appareils, le plus ancien laisse sa place
        if (!existe && Array.isArray(deja) && deja.length >= MAX_APPAREILS) {
          await fetch(`${SUPABASE_URL}/rest/v1/portal_push_subscriptions?id=eq.${deja[0].id}`, { method: "DELETE", headers: H });
        }
        const r = await fetch(`${SUPABASE_URL}/rest/v1/portal_push_subscriptions?on_conflict=project_id,endpoint`, {
          method: "POST",
          headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            project_id: project.id, endpoint, p256dh, auth,
            ua: (req.headers.get("user-agent") || "").slice(0, 180),
          }),
        });
        if (!r.ok) return json({ error: "insert_failed" }, 500);
        if (!existe) {
          const cn = await getClientName(project);
          await notifyTeam(project.id, project.name,
            '<span class="mi mi-sm">notifications_active</span> Notifications activées — ' + project.name,
            (cn || "Le client") + " sera prévenu sur son téléphone à chaque nouveau document",
            "pushclient_" + project.id);
        }
        return json({ ok: true });
      }

      if (payload.action === "approve") {
        const mid = parseInt(payload.media_id);
        if (!mid) return json({ error: "bad_request" }, 400);
        const rows = await rest(`media?id=eq.${mid}&project_id=eq.${project.id}&client_visible=is.true&select=id,name,client_approved_at`);
        const doc = rows[0];
        if (!doc) return json({ error: "not_found" }, 404);
        if (doc.client_approved_at) {
          return json({ ok: true, approved_at: doc.client_approved_at });
        }
        const clientName = await getClientName(project);
        const now = new Date().toISOString();
        await restWrite(`media?id=eq.${mid}`, "PATCH", {
          client_approved_at: now,
          client_approved_by: clientName || "Client",
        });
        await notifyTeam(project.id, project.name,
          '<span class="mi mi-sm">task_alt</span> Document validé — ' + project.name,
          (clientName || "Le client") + " a validé « " + doc.name + " »",
          "approve_" + project.id);
        return json({ ok: true, approved_at: now, approved_by: clientName || "Client" });
      }

      if (payload.action === "plan_comment") {
        const mid = parseInt(payload.media_id);
        const body = String(payload.body || "").trim().slice(0, 800);
        const xp = Math.max(0, Math.min(100, parseFloat(payload.x_pct)));
        const yp = Math.max(0, Math.min(100, parseFloat(payload.y_pct)));
        const page = Math.max(1, Math.min(200, parseInt(payload.page) || 1));
        if (!mid || !body || isNaN(xp) || isNaN(yp)) return json({ error: "bad_request" }, 400);
        const rows = await rest(`media?id=eq.${mid}&project_id=eq.${project.id}&client_visible=is.true&select=id,name,is_pdf`);
        const doc = rows[0];
        if (!doc) return json({ error: "not_found" }, 404);
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const recent = await rest(`portal_plan_comments?project_id=eq.${project.id}&created_at=gte.${encodeURIComponent(since)}&select=id`);
        if (Array.isArray(recent) && recent.length >= 40) return json({ error: "rate_limited" }, 429);
        const clientName = await getClientName(project);
        const ins = await restWrite("portal_plan_comments", "POST", {
          project_id: project.id, media_id: mid, x_pct: xp, y_pct: yp, page,
          body, author_name: String(payload.author || "").trim().slice(0, 120) || clientName || "Client",
        });
        if (!ins || !ins[0]) return json({ error: "insert_failed" }, 500);
        await notifyTeam(project.id, project.name,
          '<span class="mi mi-sm">push_pin</span> Commentaire sur plan — ' + project.name,
          (clientName || "Le client") + " · « " + doc.name + " »" + (page > 1 ? " (p." + page + ")" : "") + " : " + (body.length > 80 ? body.slice(0, 80) + "…" : body),
          "plancom_" + project.id);
        return json({ ok: true, comment: { id: ins[0].id, media_id: mid, x_pct: xp, y_pct: yp, page, body, author_name: ins[0].author_name, created_at: ins[0].created_at, done_at: null } });
      }

      if (payload.action === "upload_piece") {
        const pid = parseInt(payload.piece_id);
        const data = String(payload.data || "");
        const mime = String(payload.mime || "");
        if (!pid || !data.startsWith("data:") || data.length > 5500000) return json({ error: "bad_request" }, 400);
        const rows = await rest(`pieces_dossier?id=eq.${pid}&project_id=eq.${project.id}&select=id,label,status`);
        const piece = rows[0];
        if (!piece) return json({ error: "not_found" }, 404);
        const clientName = await getClientName(project);
        const now = new Date().toISOString();
        const sizeKB = Math.round(data.length * 0.75 / 1024);
        const med = await restWrite("media", "POST", {
          name: piece.label + " — " + (clientName || "client"),
          type: "Pièce client",
          is_pdf: mime === "application/pdf",
          mime: mime || "image/jpeg",
          data,
          project_id: project.id,
          is_general: false,
          is_project_doc: true,
          doc_type: "piece_client",
          size: sizeKB + " KB",
          added_by: clientName || "Client (portail)",
          added_at: new Date().toLocaleDateString("fr-MA"),
          client_visible: false,
        });
        const mid = med && med[0] ? med[0].id : null;
        await restWrite(`pieces_dossier?id=eq.${pid}`, "PATCH", {
          status: "recue", media_id: mid, received_at: now,
        });
        await notifyTeam(project.id, project.name,
          '<span class="mi mi-sm">upload_file</span> Pièce reçue — ' + project.name,
          (clientName || "Le client") + " a envoyé « " + piece.label + " »",
          "piece_" + project.id + "_" + pid);
        return json({ ok: true, piece_id: pid });
      }

      const body = String(payload.body || "").trim().slice(0, 3000);
      if (!body) return json({ error: "empty_message" }, 400);
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const recent = await rest(
        `client_messages?project_id=eq.${project.id}&sender=eq.client&created_at=gte.${encodeURIComponent(since)}&select=id`,
      );
      if (Array.isArray(recent) && recent.length >= 30) return json({ error: "rate_limited" }, 429);

      const clientName = await getClientName(project);
      const ins = await restWrite("client_messages", "POST", {
        project_id: project.id,
        sender: "client",
        author_name: clientName || "Client",
        body,
        read_by_client: true,
      });
      if (!ins || !ins[0]) return json({ error: "insert_failed" }, 500);
      const preview = body.length > 90 ? body.slice(0, 90) + "…" : body;
      await notifyTeam(project.id, project.name,
        '<span class="mi mi-sm">mail</span> Message client — ' + project.name,
        preview, "clientmsg_" + project.id);
      return json({ ok: true, message: { sender: "client", author_name: ins[0].author_name, body: ins[0].body, created_at: ins[0].created_at } });
    }

    // ── GET : données du portail ──
    if (url.searchParams.get("poll") !== "1") {
      try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const recentVisits = await rest(
          `portal_visits?project_id=eq.${project.id}&visited_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`,
        );
        await restWrite("portal_visits", "POST", {
          project_id: project.id,
          ua: (req.headers.get("user-agent") || "").slice(0, 180),
        });
        if (!Array.isArray(recentVisits) || recentVisits.length === 0) {
          const cn = await getClientName(project);
          await notifyTeam(project.id, project.name,
            '<span class="mi mi-sm">visibility</span> Espace client ouvert — ' + project.name,
            (cn || "Le client") + " vient d'ouvrir son espace client",
            "visit_" + project.id);
        }
      } catch (_) { /* ignore */ }
    }

    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    const isDone = (t: any) => t && (t.done === true || t.status === "done" || t.status === "termine");
    const doneCount = tasks.filter(isDone).length;
    const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
    const jalons = tasks.slice(0, 20).map((t: any) => ({
      name: String(t?.name || t?.label || t?.text || "").slice(0, 120),
      done: isDone(t),
    })).filter((j: any) => j.name);
    const clientName = await getClientName(project);

    let finance: any = null;
    try {
      const invs = await rest(
        `invoices?project_id=eq.${project.id}&deleted_at=is.null&select=id,num,object,amount,status,date,due_date,paid_date&order=date`,
      );
      const list = (invs as any[])
        .filter((i) => i.status === "Payée" || i.status === "En attente")
        .map((i) => ({
          num: i.num, object: i.object,
          amount: parseFloat(i.amount) || 0,
          status: i.status, date: i.date,
          due_date: i.due_date, paid_date: i.paid_date,
        }));
      const paid = list.filter((i) => i.status === "Payée").reduce((s, i) => s + i.amount, 0);
      const budget = parseFloat(project.budget) || 0;

      let echeancier: any[] = [];
      try {
        const echs = await rest(
          `honoraires_echeances?project_id=eq.${project.id}&select=id,label,montant,position,invoice_id,due_date&order=position,id`,
        );
        const invById: Record<string, any> = {};
        for (const i of (invs as any[])) if (i.id != null) invById[String(i.id)] = i;
        echeancier = (echs as any[]).map((e) => {
          const inv = e.invoice_id != null ? invById[String(e.invoice_id)] : null;
          const status = inv ? (inv.status === "Payée" ? "payee" : "attente") : "a_venir";
          return {
            label: e.label,
            montant: parseFloat(e.montant) || 0,
            status,
            due_date: (inv && inv.due_date) || e.due_date || null,
            paid_date: (inv && inv.paid_date) || null,
          };
        });
      } catch (_) { /* ignore */ }

      if (budget > 0 || paid > 0 || list.length || echeancier.length) {
        finance = { paid, budget, invoices: list, echeancier };
      }
    } catch (_) { /* ignore */ }

    let pieces: any[] = [];
    try {
      pieces = await rest(`pieces_dossier?project_id=eq.${project.id}&order=id&select=id,label,status`);
    } catch (_) { /* ignore */ }

    let plan_comments: any[] = [];
    try {
      plan_comments = await rest(
        `portal_plan_comments?project_id=eq.${project.id}&select=id,media_id,x_pct,y_pct,page,body,author_name,created_at,done_at&order=id&limit=300`,
      );
    } catch (_) { /* ignore */ }

    const media = await rest(
      `media?project_id=eq.${project.id}&client_visible=is.true&deleted_at=is.null&select=id,name,is_pdf,mime,doc_type,folder,file_path,url,client_approved_at,client_approved_by`,
    );
    const docs: any[] = [];
    const photos: any[] = [];
    for (const m of media) {
      let src: string | null = m.url || null;
      if (m.file_path) {
        try {
          const sr = await fetch(
            `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${m.file_path}`,
            { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) },
          );
          if (sr.ok) {
            const sj = await sr.json();
            if (sj.signedURL) src = SUPABASE_URL + "/storage/v1" + sj.signedURL;
          }
        } catch (_) { /* ignore */ }
      }
      const isImg = !m.is_pdf && ((m.mime && String(m.mime).startsWith("image/")) || m.doc_type === "photo_chantier");
      // Une image n'est une « photo de chantier » que si elle en est vraiment
      // une (doc_type ou dossier photos) ou si elle n'est rangée nulle part.
      // Une esquisse PNG rangée dans « ESQ » doit apparaître dans SON dossier.
      const folderStr = String(m.folder || "").trim();
      const isPhotoFolder = /photos?\s*(de)?\s*chantier|chantier[-\s]photos/i.test(folderStr);
      const goesToPhotos = isImg && (m.doc_type === "photo_chantier" || isPhotoFolder || !folderStr);
      const entry = { id: m.id, name: m.name, src, isPdf: !!m.is_pdf, isImg, folder: m.folder || null, approved_at: m.client_approved_at, approved_by: m.client_approved_by };
      (goesToPhotos ? photos : docs).push(entry);
    }

    const rawEvents = await rest(
      `calendar_events?project_id=eq.${project.id}&select=title,date,date_end,time_start,type&order=date`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const events = (rawEvents as any[])
      .filter((e) => e && e.date && (e.date_end || e.date) >= today)
      .slice(0, 20)
      .map((e) => ({ title: e.title, date: e.date, date_end: e.date_end, time_start: e.time_start, type: e.type }));

    const messages = await rest(
      `client_messages?project_id=eq.${project.id}&select=sender,author_name,body,created_at&order=created_at&limit=200`,
    );
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/client_messages?project_id=eq.${project.id}&sender=eq.studio&read_by_client=is.false`, {
        method: "PATCH",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ read_by_client: true }),
      });
    } catch (_) { /* ignore */ }

    return json({
      project: { name: project.name, phase: project.phase, type: project.type, progress, clientName, livraison: project.livraison_date || null, jalons },
      finance,
      pieces,
      plan_comments,
      docs,
      photos,
      events,
      messages,
    });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
