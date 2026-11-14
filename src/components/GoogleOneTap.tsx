import { useEffect, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../config';
import { useAuth, whenAuthReady } from '../lib/auth';
import { acceptGoogleCredential, googleNonce, loadGoogleIdentity } from '../lib/googleOneTap';
import { toast } from '../lib/ui';

export function GoogleOneTap({ eligible }: { eligible: boolean }) {
  const {status,userId}=useAuth();
  const [pending,setPending]=useState<{token:string;nonce:string;owner:string}|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!eligible||status!=='anon'||!userId||!GOOGLE_CLIENT_ID||sessionStorage.getItem('skillissue:one-tap-shown'))return;
    let active=true;
    void Promise.all([loadGoogleIdentity(),googleNonce(),whenAuthReady()]).then(([google,nonce])=>{
      const current=useAuth.getState();
      if(!active||current.status!=='anon'||current.userId!==userId)return;
      google.initialize({client_id:GOOGLE_CLIENT_ID,nonce:nonce.hashed,auto_select:false,use_fedcm_for_prompt:true,
        callback:response=>{
          if(!active)return;
          google.cancel();
          void acceptGoogleCredential(response.credential,nonce.raw,userId).then(result=>{
            if(active&&result==='conflict')setPending({token:response.credential,nonce:nonce.raw,owner:userId});
            else if(result==='linked')toast('Google connected. Your progress is saved.');
          }).catch((cause:Error)=>toast(cause.message));
        }});
      sessionStorage.setItem('skillissue:one-tap-shown','1');google.prompt();
    }).catch(()=>{/* Regular Google button stays available when the prompt is blocked. */});
    return()=>{active=false;window.google?.accounts.id.cancel();};
  },[eligible,status,userId]);
  async function switchPlayer(){
    if(!pending||busy)return;setBusy(true);
    try{await acceptGoogleCredential(pending.token,pending.nonce,pending.owner,true);setPending(null);toast('Signed into your existing player.');}
    catch(cause){toast(cause instanceof Error?cause.message:'Could not sign in.');setPending(null);}
    finally{setBusy(false);}
  }
  if(!pending||status!=='anon'||pending.owner!==userId||!eligible)return null;
  return <div className="modal"><div className="modal-box px-box" role="dialog" aria-modal="true" aria-labelledby="google-switch-title">
    <h2 id="google-switch-title">You already have a player</h2>
    <p>This Google account has its own progress. Switch to that player? Your current guest scores stay with this guest and will not be merged.</p>
    <div className="r-actions"><button className="btn btn-primary" disabled={busy} onClick={()=>void switchPlayer()}>{busy?'Signing in...':'Switch player'}</button><button className="btn btn-ghost" disabled={busy} onClick={()=>setPending(null)} autoFocus>Keep this guest</button></div>
  </div></div>;
}
