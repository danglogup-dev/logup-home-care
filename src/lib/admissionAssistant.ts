/**
 * "Start from a document" for admissions. Simulated for the prototype: a
 * real model can replace extractAdmissionDetails without touching the page.
 * Every returned value is an AI draft with the text it came from; nothing is
 * saved until a person confirms it.
 */
export interface ExtractedField {
  /** Admit-flow field key, e.g. "legalFirstName", "gp.name". */
  field: string;
  value: string;
  sourceText: string;
}

export async function extractAdmissionDetails(file: File): Promise<ExtractedField[]> {
  let text = "";
  try { if (/text|json|csv/.test(file.type) || /\.(txt|md)$/i.test(file.name)) text = await file.text(); } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 700));
  const found: ExtractedField[] = [];
  const grab = (field: string, re: RegExp) => {
    const m = text.match(re);
    if (m) found.push({ field, value: m[1].trim(), sourceText: m[0].trim() });
  };
  if (text) {
    grab("legalFirstName", /first name[:\s]+([A-Za-zÀ-ÿ'’-]+)/i);
    grab("legalLastName", /(?:surname|last name)[:\s]+([A-Za-zÀ-ÿ'’-]+)/i);
    grab("dateOfBirth", /(?:dob|date of birth)[:\s]+(\d{4}-\d{2}-\d{2})/i);
    grab("previousAddress", /address[:\s]+([^\n]+)/i);
    grab("gp.name", /gp[:\s]+(Dr\.?\s[^\n,]+)/i);
  }
  if (found.length) return found;
  // Demo document: a typical hospital discharge letter.
  return [
    { field: "legalFirstName", value: "Bernadette", sourceText: "Patient: Bernadette Keane" },
    { field: "legalLastName", value: "Keane", sourceText: "Patient: Bernadette Keane" },
    { field: "dateOfBirth", value: "1941-06-22", sourceText: "DOB 22/06/1941" },
    { field: "previousAddress", value: "14 Barrack Street, Carlow", sourceText: "Home address: 14 Barrack Street, Carlow" },
    { field: "admittedFromName", value: "St Luke's General Hospital, Kilkenny", sourceText: "Discharged from St Luke's General Hospital, Kilkenny" },
    { field: "gp.name", value: "Dr Fiona Doyle", sourceText: "GP: Dr Fiona Doyle, Tullow Road Practice" },
    { field: "gp.practice", value: "Tullow Road Practice, Carlow", sourceText: "GP: Dr Fiona Doyle, Tullow Road Practice" },
  ];
}
