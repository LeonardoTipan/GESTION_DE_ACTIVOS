import { Transform } from 'class-transformer';

/** Quita espacios al inicio y al final de un texto recibido (" SRV-001 " → "SRV-001"). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
