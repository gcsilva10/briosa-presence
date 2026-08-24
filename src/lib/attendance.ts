import { apiUrl } from "./api";

export async function saveAttendance(matchId: string, attended: boolean) {
  const response = await fetch(apiUrl(`/api/matches/${encodeURIComponent(matchId)}/attendance`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attended }),
  });

  if (!response.ok) throw new Error("Não foi possível guardar a presença.");
}
