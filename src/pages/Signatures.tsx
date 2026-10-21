import { useState } from "react";
import { PenLine, Trash2 } from "lucide-react";
import { Alert, Button, Modal, PageHeader, Switch, Toast } from "../components/ui";
import { PrivacyNote, SignatureCard, SignatureCreator } from "../components/pdf";
import { useDocument } from "../state/document";
import type { SignKind } from "../state/signatures";
import s from "./signatures.module.css";

const NOUN: Record<SignKind, string> = { signature: "signature", initials: "initials" };
const savedOn = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function Signatures() {
  const { signature, initials, setSignature, setInitials, kept, setKept } = useDocument();
  const [making, setMaking] = useState<SignKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imgOf = (k: SignKind) => (k === "signature" ? signature : initials);
  const setOf = (k: SignKind) => (k === "signature" ? setSignature : setInitials);

  const keep = async (k: SignKind, on: boolean) => {
    setError(null);
    try {
      await setKept(k, on);
      setToast(on ? `Your ${NOUN[k]} is kept on this device` : `Your ${NOUN[k]} was removed from this device`);
    } catch {
      setError("This browser won't let the page save anything. Private windows and some privacy settings block it, so your signature stays for this tab only.");
    }
  };

  return (
    <>
      <PageHeader banner="loops" eyebrow="On this device" title="My signatures"
        description="Draw, type or upload your signature and initials once, then place them in Sign. They're kept for this tab unless you choose to keep them on this device." />

      {error && <Alert tone="warn" title="Couldn't save on this device">{error}</Alert>}

      <div className={s.grid}>
        {(["signature", "initials"] as const).map((k) => {
          const img = imgOf(k);
          const at = kept[k];
          const label = k === "signature" ? "Signature" : "Initials";
          return (
            <section key={k} className={s.item} aria-labelledby={`${k}-h`}>
              <h2 id={`${k}-h`}>{label}</h2>
              <SignatureCard kind={k} img={img} text={img ? "" : k === "signature" ? "Your name" : "AB"}
                saved={!img ? "not made yet" : at ? `kept on this device since ${savedOn(at)}` : "this tab only"} />
              <div className={s.actions}>
                <Button variant={img ? "secondary" : "primary"} size="sm" icon={<PenLine aria-hidden />} onClick={() => setMaking(k)}>
                  {img ? `Replace ${NOUN[k]}` : `Make your ${NOUN[k]}`}
                </Button>
                {img && (
                  <Button variant="quiet" size="sm" icon={<Trash2 aria-hidden />}
                    onClick={() => { setOf(k)(null); setToast(`Your ${NOUN[k]} was deleted`); }}>Delete</Button>
                )}
              </div>
              <div className={s.keep}>
                <Switch label="Keep on this device" checked={!!at} disabled={!img} onChange={(e) => keep(k, e.target.checked)} />
                <p>{img ? "Saved in this browser only, so you don't have to make it again. Turn off to remove it." : `Make your ${NOUN[k]} first.`}</p>
              </div>
            </section>
          );
        })}
      </div>

      <PrivacyNote block />

      <Modal open={!!making} onClose={() => setMaking(null)} title={making === "initials" ? "Your initials" : "Your signature"}
        description={making && kept[making] ? "This replaces the copy kept on this device." : undefined}>
        {making && (
          <SignatureCreator key={making} kind={making} onCancel={() => setMaking(null)}
            onUse={(img) => { setOf(making)(img); setMaking(null); setToast(`Your ${NOUN[making]} is ready to place in Sign`); }} />
        )}
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
