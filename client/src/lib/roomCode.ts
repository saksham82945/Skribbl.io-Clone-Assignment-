/** Accepts a bare code ("ABC123") or a pasted invite link (".../room/ABC123"). */
export const extractCode = (input: string) => (input.trim().match(/([A-Za-z0-9]{6})\/?$/)?.[1] ?? input.trim()).toUpperCase();
