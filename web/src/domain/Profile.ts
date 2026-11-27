import { Schema } from "effect"

/** What the agent returns for the signed-in person (GET /eve/v1/account). */
export const Festival = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  greeting: Schema.String,
  emoji: Schema.String,
  accessory: Schema.String,
  effect: Schema.String
})
export type Festival = typeof Festival.Type

export const Today = Schema.Struct({
  date: Schema.String,
  weekday: Schema.String,
  partOfDay: Schema.String,
  season: Schema.String,
  festival: Schema.NullOr(Festival)
})
export type Today = typeof Today.Type

export const AutoRule = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  weekday: Schema.Number,
  startTime: Schema.String,
  durationMinutes: Schema.Number
})
export type AutoRule = typeof AutoRule.Type

export const Profile = Schema.Struct({
  username: Schema.String,
  agentName: Schema.String,
  avatar: Schema.String,
  avatarImage: Schema.NullOr(Schema.String),
  timezone: Schema.String,
  birthday: Schema.NullOr(Schema.String),
  googleConnected: Schema.Boolean,
  pushSubscribed: Schema.Boolean,
  autoRules: Schema.Array(AutoRule),
  today: Today
})
export type Profile = typeof Profile.Type

export const decodeProfile = Schema.decodeUnknownSync(Profile)

/** One line of the conversation, kept on this phone. */
export const ChatLine = Schema.Struct({
  role: Schema.Literals(["u", "a"]),
  text: Schema.String
})
export type ChatLine = typeof ChatLine.Type

export const firstName = (profile: Profile): string => {
  const base = profile.username.replace(/[_-].*/, "")
  return base ? base[0]!.toUpperCase() + base.slice(1) : ""
}
