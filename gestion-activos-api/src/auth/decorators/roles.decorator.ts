import { SetMetadata } from '@nestjs/common';
import type { AppRole } from '../roles.js';

export const ROLES_KEY = 'roles';

/** Exige que el usuario tenga AL MENOS UNO de los roles indicados. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
