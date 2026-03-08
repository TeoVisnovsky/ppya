import { answerChatbotQuestion } from "./service.js";

function getErrorMessage(error) {
  return error?.message || "Unexpected chatbot error";
}

export function registerChatbotRoutes(app) {
  app.post("/api/chatbot/query", async (req, res) => {
    try {
      const message = String(req.body?.message || "").slice(0, 500);
      const result = await answerChatbotQuestion(message, req.body?.plan || null);
      res.json(result);
    } catch (error) {
      const status = /required/i.test(error?.message || "") ? 400 : 500;
      res.status(status).json({ ok: false, error: getErrorMessage(error) });
    }
  });
}
