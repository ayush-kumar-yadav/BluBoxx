import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface UserAttrs {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<UserAttrs, object, UserMethods>;

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export type UserDoc = HydratedDocument<UserAttrs, UserMethods>;

export const User = model<UserAttrs, UserModel>('User', userSchema);

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Shape safe to send to the client - never the passwordHash. */
export function toPublicUser(user: UserDoc) {
  return { id: user._id.toString(), email: user.email, name: user.name };
}