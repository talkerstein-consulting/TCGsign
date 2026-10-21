// Opening a PDF from any screen: handles password-protected and damaged files in one place.
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Field, InlineError, Input, Modal } from "../components/ui";
import { NotAPdf, PasswordNeeded } from "../pdf/errors";
import { useDocument, type Restore } from "../state/document";
import type { Draft } from "../state/drafts";

type Attempt = { file: File; restore?: Restore; dest: string };

/** `to`: where to go once the file is open. */
export function useOpenFile(to = "/editor") {
  const { open } = useDocument();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);
  const [locked, setLocked] = useState<(Attempt & { incorrect: boolean }) | null>(null);
  const [password, setPassword] = useState("");

  const attempt = async (a: Attempt, pw?: string) => {
    setBusy(true); setError(null);
    try {
      await open(a.file, pw, a.restore);
      setLocked(null); setPassword("");
      navigate(a.dest);
    } catch (e) {
      if (e instanceof PasswordNeeded) setLocked({ ...a, incorrect: e.incorrect });
      else if (e instanceof NotAPdf) setError({ name: a.file.name, message: "It isn't a valid PDF, or it's damaged. Try exporting it again from the app that made it." });
      else setError({ name: a.file.name, message: "Something went wrong while reading it. Try again, or try another browser." });
    } finally { setBusy(false); }
  };

  const ui = (
    <>
      {error && <InlineError title={`Couldn't open ${error.name}`}>{error.message}</InlineError>}
      <Modal open={!!locked} onClose={() => { setLocked(null); setPassword(""); }} size="sm"
        title="This PDF is password protected" description={locked?.file.name}
        footer={<>
          <Button variant="quiet" onClick={() => { setLocked(null); setPassword(""); }}>Cancel</Button>
          <Button busy={busy} disabled={!password} onClick={() => locked && attempt(locked, password)}>Open</Button>
        </>}>
        <form onSubmit={(e) => { e.preventDefault(); if (locked && password) attempt(locked, password); }}>
          <Field label="Password" hint="Used only in this browser to open the file. Drafts never store it." error={locked?.incorrect ? "That password didn't work. Check it and try again." : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" aria-invalid={locked?.incorrect || undefined} />
          </Field>
        </form>
      </Modal>
    </>
  );

  return {
    openFile: (file: File) => attempt({ file, dest: to }),
    /** Reopen a saved draft with its fields. `dest` defaults to the editor; Review downloads it. */
    openDraft: (d: Draft, dest = "/editor") => attempt({
      file: new File([d.bytes as BlobPart], d.name, { type: "application/pdf" }),
      restore: { draftId: d.id, fields: d.fields, savedAt: d.savedAt }, dest,
    }),
    busy, ui,
  };
}
