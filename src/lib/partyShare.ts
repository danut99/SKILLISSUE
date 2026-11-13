import { partyStandings, partyUrl, type PartyRoom } from './party';
export async function sharePartyInvite(room: PartyRoom) {
  const url = partyUrl(room.token);
  if (navigator.share) { try { await navigator.share({ title: 'Join my Skill Issue party', text: 'Draw. Cut. Brake. Prove your friends are worse.', url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } }
  await navigator.clipboard.writeText(url);
}
export async function sharePartyPodium(room: PartyRoom) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1000;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#050a14'; c.fillRect(0, 0, 720, 1000);
  c.strokeStyle = '#1b3050'; for (let y = 0; y < 1000; y += 40) { c.beginPath(); c.moveTo(0,y); c.lineTo(720,y); c.stroke(); }
  c.textAlign = 'center'; c.font = '64px VT323'; c.fillStyle = '#4de3ff'; c.fillText('SKILL ISSUE PARTY', 360, 85);
  c.font = '32px VT323'; c.fillStyle = '#7d93b8'; c.fillText(`Match ${room.match_no} / ${room.round_count ?? 6} rounds`, 360, 135);
  const rows = partyStandings(room.players, 11);
  rows.forEach((p, i) => { const y = 215 + i * 80; c.fillStyle = p.rank === 1 ? '#ffd23f' : '#e8f1ff'; c.font = '32px VT323'; c.fillText(`#${p.rank} ${p.name.slice(0, 24)} - ${p.total.toFixed(1)}`, 360, y); c.font = '23px VT323'; c.fillStyle = '#ff5d8f'; c.fillText(p.rank === 1 ? 'Carried the group' : p.rank === 2 ? 'Almost useful' : 'Certified liability', 360, y + 28); });
  c.font = '28px VT323'; c.fillStyle = '#4de3ff'; c.fillText('Your friends could never.', 360, 925);
  c.font = '22px VT323'; c.fillText(location.host, 360, 965);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create image')), 'image/png'));
  const file = new File([blob], 'skill-issue-party.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Party results' }); return; } catch(e) { if ((e as Error).name === 'AbortError') return; } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
