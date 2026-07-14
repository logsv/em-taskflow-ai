import { z } from "zod";

export const AgentOutputSchema = z.object({
  summary: z.string().describe("A brief, high-level summary of the findings."),
  findings: z.array(z.string()).describe("A list of concrete bullet-point findings."),
  evidence: z.array(
    z.object({
      source: z.string().describe("The source tool or API name that provided this evidence."),
      data: z.any().describe("The exact supporting records or structured data fields from the tool output."),
    })
  ).describe("Concrete evidence/payloads backing up the findings."),
  confidence: z.number().min(0).max(1).describe("Confidence score (0 to 1) representing the completeness of the gathered facts."),
});
