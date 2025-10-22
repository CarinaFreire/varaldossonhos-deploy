// ============================================================
// 💙 VARAL DOS SONHOS — /api/index.js (VERSÃO ENXUTA)
// -----------------------------------------------------------

import Airtable from "airtable";
import enviarEmail from "./lib/enviarEmail.js"; // ✅ Mantido

// ============================================================
// ============================================================
// 💙 VARAL DOS SONHOS — /api/index.js (Server + Handler completo)
// ------------------------------------------------------------
// Mantém toda a lógica do handler original e adiciona servidor
// HTTP mínimo para compatibilidade com Render.
// ============================================================

import Airtable from "airtable";
import enviarEmail from "./lib/enviarEmail.js"; // sua lógica original
import http from "http";

// ============================================================
// 🔑 Configuração Airtable
// ============================================================
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
const AIRTABLE_TABLE_ADMIN = process.env.AIRTABLE_TABLE_ADMIN;
const AIRTABLE_CARTINHAS_TABLE = process.env.AIRTABLE_CARTINHAS_TABLE;
const AIRTABLE_EVENTOS_TABLE = process.env.AIRTABLE_EVENTOS_TABLE;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn("⚠️ Defina AIRTABLE_API_KEY e AIRTABLE_BASE_ID nas variáveis da Render.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// ============================================================
// ⚙️ Helpers de resposta JSON + CORS
// ============================================================
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data, null, 2));
}

// ============================================================
// 📦 Leitura segura do corpo JSON
// ============================================================
async function parseJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return null;
  }
}

// ============================================================
// 🔍 Helper para extrair rota (?rota=)
// ============================================================
function getRotaFromUrl(reqUrl, headers) {
  try {
    const u = new URL(reqUrl, `http://${headers.host}`);
    return { fullUrl: u, rota: u.searchParams.get("rota") };
  } catch {
    const parts = reqUrl.split("?rota=");
    return { fullUrl: null, rota: parts[1] || null };
  }
}

// ============================================================
// 🌈 HANDLER PRINCIPAL
// ============================================================
async function handler(req, res) {
  // Pré-flight CORS
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.end();
    return;
  }

  const { method, url, headers } = req;
  const { fullUrl, rota } = getRotaFromUrl(url, headers);
  const pathname = fullUrl ? fullUrl.pathname : url.split("?")[0];

  try {
    // ============================================================
    // 🗓️ EVENTOS — destaques (Home/carrossel)
    if ((pathname === "/api/eventos" || rota === "eventos") && method === "GET") {
      const records = await base(AIRTABLE_EVENTOS_TABLE)
        .select({
          filterByFormula: "IF({destaque_home}=TRUE(), TRUE(), FALSE())",
          sort: [{ field: "data_inicio", direction: "asc" }],
        })
        .all();

      const eventos = (records || []).map((r) => ({
        id: r.id,
        nome: r.fields.nome_evento || r.fields.nome || "Evento sem nome",
        data_inicio: r.fields.data_inicio || "",
        descricao: r.fields.descricao || "",
        imagem:
          r.fields.imagem_evento?.[0]?.url ||
          r.fields.Imagem_evento?.[0]?.url ||
          "/imagens/evento-padrao.jpg",
      }));

      return sendJson(res, 200, eventos);
    }

    // ============================================================
    // 📝 EVENTO-DETALHE
    if ((pathname === "/api/evento-detalhe" || rota === "evento-detalhe") && method === "GET") {
      const id = fullUrl ? fullUrl.searchParams.get("id") : null;
      if (!id) return sendJson(res, 400, { error: "ID do evento não informado" });
      const r = await base(AIRTABLE_EVENTOS_TABLE).find(id);
      const evento = {
        id: r.id,
        nome: r.fields.nome_evento || r.fields.nome || "Evento sem nome",
        data_inicio: r.fields.data_inicio || "",
        data_fim: r.fields.data_fim || "",
        descricao: r.fields.descricao || "",
        local: r.fields.local || "",
        status: r.fields.status || "",
        imagem:
          r.fields.imagem_evento?.[0]?.url || r.fields.imagem?.[0]?.url || "/imagens/evento-padrao.jpg",
      };
      return sendJson(res, 200, evento);
    }

    // ============================================================
    // 💌 CARTINHAS — disponíveis para adoção
    if ((pathname === "/api/cartinhas" || rota === "cartinhas") && method === "GET") {
      const registros = await base(AIRTABLE_CARTINHAS_TABLE)
        .select({ filterByFormula: "IF({status}='disponível', TRUE(), FALSE())" })
        .all();

      const cartinhas = registros.map((r) => {
        const f = r.fields;
        return {
          id: r.id,
          nome: f.nome_crianca || f.primeiro_nome || "Anônimo",
          idade: f.idade || "",
          sonho: f.sonho || "",
          ponto_coleta: f.ponto_coleta || "",
          imagem_cartinha: f.imagem_cartinha?.[0]?.url || "",
          status: f.status || "disponível",
        };
      });
      return sendJson(res, 200, cartinhas);
    }

    // ============================================================
    // 🧍 CADASTRO — cria novo usuário
    if ((pathname === "/api/cadastro" || rota === "cadastro") && method === "POST") {
      const body = await parseJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Corpo inválido" });
      const { nome, email, senha } = body;
      if (!nome || !email || !senha)
        return sendJson(res, 400, { error: "Campos obrigatórios faltando." });

      const existentes = await base(AIRTABLE_TABLE_NAME)
        .select({ filterByFormula: `{email} = "${email}"`, maxRecords: 1 })
        .firstPage();
      if (existentes.length > 0) return sendJson(res, 409, { error: "E-mail já cadastrado." });

      const novo = await base(AIRTABLE_TABLE_NAME).create([
        {
          fields: {
            nome,
            email,
            senha,
            tipo_usuario: "doador",
            status: "ativo",
            data_cadastro: new Date().toISOString().split("T")[0],
          },
        },
      ]);

      try {
        await enviarEmail(email, "Bem-vindo ao Varal dos Sonhos", `Olá ${nome}, seu cadastro foi realizado!`);
      } catch (err) {
        console.warn("Falha ao enviar e-mail:", err);
      }

      return sendJson(res, 200, { message: "Usuário cadastrado com sucesso.", id: novo[0].id });
    }

    // ============================================================
    // 🔐 LOGIN — autenticação simples
    if ((pathname === "/api/login" || rota === "login") && method === "POST") {
      const body = await parseJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Corpo inválido" });
      const { email, senha } = body;
      if (!email || !senha) return sendJson(res, 400, { error: "Email e senha obrigatórios." });

      const registros = await base(AIRTABLE_TABLE_NAME)
        .select({ filterByFormula: `{email} = "${email}"`, maxRecords: 1 })
        .firstPage();
      if (registros.length === 0) return sendJson(res, 401, { error: "Usuário não encontrado." });

      const usuario = registros[0].fields;
      if (usuario.senha !== senha) return sendJson(res, 401, { error: "Senha incorreta." });

      return sendJson(res, 200, {
        success: true,
        usuario: {
          id: registros[0].id,
          nome: usuario.nome,
          email: usuario.email,
          tipo_usuario: usuario.tipo_usuario || "doador",
        },
      });
    }

    // ============================================================
    // 💝 ADOÇÕES — registra e confirma via e-mail
    if ((pathname === "/api/adocoes" || rota === "adocoes") && method === "POST") {
      const body = await parseJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Corpo inválido" });
      const { usuarioEmail, cartinhas } = body;
      if (!usuarioEmail || !Array.isArray(cartinhas))
        return sendJson(res, 400, { error: "Dados inválidos." });

      for (const c of cartinhas) {
        await base("doacoes").create([
          {
            fields: {
              doador: usuarioEmail,
              cartinha: c.id_cartinha || c.id || "",
              ponto_coleta: c.ponto_coleta || "",
              data_doacao: new Date().toISOString().split("T")[0],
              status_doacao: "aguardando_entrega",
            },
          },
        ]);
      }

      try {
        await enviarEmail(
          usuarioEmail,
          "Confirmação de Adoção",
          `Recebemos sua adoção de ${cartinhas.length} cartinha(s). Obrigado pelo carinho!`
        );
      } catch (err) {
        console.warn("Erro ao enviar confirmação:", err);
      }

      return sendJson(res, 200, { success: true, message: "Adoções registradas com sucesso!" });
    }

    // ============================================================
    // 🚫 Rota não encontrada
    return sendJson(res, 404, { erro: "Rota não encontrada." });
  } catch (erro) {
    console.error("❌ Erro interno:", erro);
    return sendJson(res, 500, {
      erro: "Erro interno no servidor.",
      detalhe: erro.message || String(erro),
    });
  }
}

// ============================================================
// 🚀 Servidor HTTP mínimo para Render
// ============================================================
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
