/**
 * Het CBR-opleidernummer (te vinden in de Rijschoolzoeker van het CBR). Het exacte formaat is niet
 * openbaar gedocumenteerd, dus we controleren alleen op "ziet eruit als een code": 3 tot 20 tekens,
 * letters, cijfers, spaties en streepjes.
 */
export function normalizeOpleidernummer(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function opleidernummerProblem(value: string): string | undefined {
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/.test(value))
    return "Vul uw CBR-opleidernummer in (3 tot 20 tekens: letters, cijfers, spaties of streepjes).";
  return undefined;
}
