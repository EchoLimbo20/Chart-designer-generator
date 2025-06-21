// Usamos o SDK do Google para facilitar a comunicação com a API Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Pega a chave de API das variáveis de ambiente do servidor (NUNCA exponha no frontend)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define as "ferramentas" que a IA pode usar.
// Isso é como dar superpoderes à IA, mas apenas os que nós permitimos.
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

// A função principal do nosso backend.
// Vercel irá transformar este arquivo em um endpoint de API chamado /api/chat
export default async function handler(req, res) {
  // Apenas aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { history } = req.body;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      // Instrução principal para a IA
      systemInstruction: `Você é Alladin, um gênio assistente dentro do aplicativo web AllaChart. Seu objetivo é ajudar os usuários a criar e customizar gráficos. Seja amigável e prestativo.
      - Responda a dúvidas gerais sobre como usar a aplicação.
      - Se o usuário pedir uma ação que você pode executar com uma ferramenta, chame a ferramenta.
      - Depois de executar uma ferramenta, confirme a ação para o usuário de forma amigável. Ex: 'Prontinho! Mudei a cor para um azul vibrante.' ou 'Ok, gerei um novo gráfico aleatório para você começar.'.
      - Se o usuário fornecer dados incompletos para 'setChartData', peça educadamente pelos dados que faltam em vez de tentar adivinhar.
      - Hoje é ${new Date().toLocaleDateString('pt-BR')}.`,
      tools,
    });

    const chat = model.startChat({
      history: history.slice(0, -1), // Envia o histórico, exceto a última mensagem
    });

    const lastUserMessage = history[history.length - 1];
    const result = await chat.sendMessage(lastUserMessage.parts);
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
    res.status(500).json({ error: "Ocorreu um erro ao processar sua solicitação." });
  }
}