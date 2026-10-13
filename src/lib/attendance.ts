import { updateAttendance } from "./cloud";
export async function saveAttendance(matchId: string, attended: boolean) {
  await updateAttendance(matchId, attended);
}
