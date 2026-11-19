export type ActionState =
  | { ok: true; message: string; link?: string }
  | { ok: false; error: string }
  | null;
