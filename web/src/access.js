export const ADMIN_EMAIL = 'beniwealth70@gmail.com';
export const isAdminUser = user => String(user?.email || '').toLowerCase() === ADMIN_EMAIL;
