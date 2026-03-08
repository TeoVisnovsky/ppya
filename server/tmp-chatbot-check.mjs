import { answerChatbotQuestion } from "./src/chatbot/service.js";

for (const question of ["kto ma sperky", "kto ma motorku", "Who has liabilities?"]) {
  const result = await answerChatbotQuestion(question);
  console.log("QUESTION=" + question);
  console.log(JSON.stringify({
    intent: result.intent,
    heading: result.heading,
    answer: result.answer,
    firstCard: result.cards?.[0] ? {
      title: result.cards[0].title,
      contextLabel: result.cards[0].contextLabel,
      related: result.cards[0].related,
    } : null,
  }, null, 2));
}
