// /api/chat.js

// Usamos o SDK do Google para facilitar a comunicação com a API Gemini
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// Pega a chave de API das variáveis de ambiente do servidor (NUNCA exponha no frontend)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Inicializa o cliente da API. Se a chave não existir, a aplicação irá falhar com um erro claro.
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define as "ferramentas" que a IA pode usar, correspondendo às funções do seu frontend.
const tools = {
  functionDeclarations: [
    {
      name: "generateRandomChart",
      description: "Gera um novo gráfico com dados completamente aleatórios. Útil quando o usuário pede por 'um exemplo', 'um gráfico aleatório' ou 'começar do zero'.",
      parameters: { type: "OBJECT", properties: {} } // Sem parâmetros
    },
    {
      name: "changeChartColor",
      description: "Muda a cor principal da série do gráfico (a cor da linha, das barras, etc).",
      parameters: {
        type: "OBJECT",
        properties: {
          color: { type: "STRING", description: "A cor em formato hexadecimal, como '#FF5733'. Deve interpretar o pedido do usuário (ex: 'azul vivo', 'vermelho escuro') e converter para um código hexadecimal apropriado." }
        },
        required: ["color"]
      }
    },
    {
      name: "setChartData",
      description: "Define um novo conjunto de dados para o gráfico. Use isso quando o usuário fornecer dados explícitos, como 'ano 2005 valor 100, ano 2006 valor 150'.",
      parameters: {
        type: "OBJECT",
        properties: {
          labels: { type: "ARRAY", items: { type: "STRING" }, description: "Uma lista de rótulos para o eixo X, geralmente anos ou categorias. Ex: ['2005', '2006']" },
          values: { type: "ARRAY", items: { type: "NUMBER" }, description: "Uma lista de valores numéricos para o eixo Y, correspondendo a cada rótulo. Ex: [100, 150]" }
        },
        required: ["labels", "values"]
      }
    }
  ]
};

// Adiciona configurações de segurança como boa prática
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// A função principal do nosso backend.
export default async function handler(req, res) {
  // Apenas aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verifica se a chave de API está configurada no servidor
  if (!GEMINI_API_KEY) {
    console.error("A chave GEMINI_API_KEY não foi encontrada nas variáveis de ambiente.");
    return res.status(500).json({ error: "Erro de configuração no servidor: A chave da API não foi encontrada." });
  }

  try {
    const { history } = req.body;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      // Instrução principal para a IA
      systemInstruction: `Você é Alla, um gênio assistente dentro do aplicativo web AllaChart. Seu objetivo é ajudar os usuários a criar e customizar gráficos. Seja amigável e prestativo.
      - Responda a dúvidas gerais sobre como usar a aplicação.
      - Se o usuário pedir uma ação que você pode executar com uma ferramenta, chame a ferramenta.
      - Depois de executar uma ferramenta, confirme a ação para o usuário de forma amigável. Ex: 'Prontinho! Mudei a cor para um azul vibrante.' ou 'Ok, gerei um novo gráfico aleatório para você começar.'.
      - Se o usuário fornecer dados incompletos para 'setChartData', peça educadamente pelos dados que faltam em vez de tentar adivinhar.
      - A data de hoje é ${new Date().toLocaleDateString('pt-BR')}.`,
      tools,
      safetySettings, // Aplica as configurações de segurança
    });

    // --- CORREÇÃO PRINCIPAL ---
    // Inicia o chat com o histórico COMPLETO recebido do frontend.
    // Isso é crucial para que o modelo entenda todo o contexto da conversa,
    // especialmente após a execução de uma ferramenta (function calling).
    const chat = model.startChat({
      history: history || [],
    });

    // Envia uma mensagem com um placeholder. O modelo usará o último item do histórico 
    // (seja uma mensagem de usuário ou uma resposta de ferramenta) como o gatilho 
    // para gerar a próxima resposta. Esta é a forma mais robusta de lidar com o fluxo.
    const result = await chat.sendMessage(" ");
    
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      // A IA quer usar uma ferramenta
      res.status(200).json({ toolCall: functionCalls[0] });
    } else {
      // A IA respondeu com texto
      res.status(200).json({ text: response.text() });
    }

  } catch (error) {
    console.error('Erro na API da IA:', error);
    // Retorna uma mensagem de erro mais detalhada para facilitar a depuração
    res.status(500).json({ error: `Ocorreu um erro ao processar sua solicitação: ${error.message}` });
  }
}