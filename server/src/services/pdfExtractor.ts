import fs from 'fs';

export async function extractTextFromPdf(filePath: string): Promise<string> {
  // Dynamically import pdf-parse (CommonJS module)
  const pdfParse = (await import('pdf-parse')).default;
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}
