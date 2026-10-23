import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { question_text, answer, chimney_type, appliance_type } = await req.json();
    if (!question_text || answer === undefined) {
      return Response.json({ error: 'question_text and answer required' }, { status: 400 });
    }

    const context = [
      chimney_type ? `Chimney type: ${chimney_type}` : '',
      appliance_type ? `Appliance type: ${appliance_type}` : '',
    ].filter(Boolean).join(', ');

    const prompt = `You are a certified chimney inspection expert. A technician answered an inspection question.

Question: "${question_text}"
Answer: "${Array.isArray(answer) ? answer.join(', ') : answer}"
${context ? `Context: ${context}` : ''}

In 1-2 concise sentences, explain what this answer means for the homeowner's safety and chimney health. Where applicable, cite the exact NFPA 211 section number (e.g. "per NFPA 211 Section 14.2.1"). 
- If the answer indicates a problem (e.g. cracked, failed, deficient, needs repair, water damage, improper installation), explain the risk and urgency.
- If the answer is acceptable/good, briefly confirm what it means.
- Reference NFPA 211 or relevant chimney codes only if directly applicable.
- Keep it professional and plain-English, no jargon.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });

    return Response.json({ explanation: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});