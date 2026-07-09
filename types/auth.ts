export interface User {
  _id?: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'super_admin';
  allowedPages?: string[];
  ref?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'super_admin';
  allowedPages?: string[];
  ref?: string;
}
