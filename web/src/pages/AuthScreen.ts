import { Command, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"
import { Avatar } from "../components/Avatar.ts"
import { FxLayer } from "../components/FxLayer.ts"
import { decodeProfile, Profile } from "../domain/Profile.ts"
import { call, failureOf } from "../platform/api.ts"

export const AuthScreenMessage = UiSchema.TaggedEnum({
  ClickedSignInTab: {},
  ClickedSignUpTab: {},
  UpdatedUsername: { value: Schema.String },
  UpdatedPassword: { value: Schema.String },
  UpdatedInvite: { value: Schema.String },
  SubmittedAuthForm: {},
  PressedAvatar: {},
  SucceededLoadAuthConfig: { inviteRequired: Schema.Boolean },
  SucceededAuthenticate: { token: Schema.String, profile: Profile },
  FailedAuthenticate: { reason: Schema.String },
  CompletedWelcome: {},
  CompletedMoodPause: { seq: Schema.Number }
})

export const AuthScreenEvents = UiSchema.TaggedEnum({
  SignedIn: { token: Schema.String, profile: Profile }
})

const LoadAuthConfig = Command.make("LoadAuthConfig", {}, () =>
  Effect.tryPromise(() => call("", "/eve/v1/account/config")).pipe(
    Effect.match({
      onSuccess: (data) =>
        AuthScreenMessage.SucceededLoadAuthConfig({ inviteRequired: Boolean((data as { inviteRequired?: boolean } | null)?.inviteRequired) }),
      onFailure: () => AuthScreenMessage.SucceededLoadAuthConfig({ inviteRequired: false })
    })
  ))

const Authenticate = Command.make(
  "Authenticate",
  { args: { signUp: Schema.Boolean, username: Schema.String, password: Schema.String, inviteCode: Schema.String } },
  ({ inviteCode, password, signUp, username }) =>
    Effect.tryPromise(async () => {
      const data = (await call("", signUp ? "/eve/v1/account/register" : "/eve/v1/account/login", {
        body: { username: username.trim().toLowerCase(), password, inviteCode }
      })) as { token: string; profile: unknown }
      return { token: data.token, profile: decodeProfile(data.profile) }
    }).pipe(
      Effect.match({
        onSuccess: ({ profile, token }) => AuthScreenMessage.SucceededAuthenticate({ token, profile }),
        onFailure: (error) => AuthScreenMessage.FailedAuthenticate({ reason: failureOf(error.cause ?? error).reason })
      })
    )
)

const WaitForWelcome = Command.make("WaitForWelcome", {}, () =>
  Effect.sleep(700).pipe(Effect.as(AuthScreenMessage.CompletedWelcome())))

const PauseMood = Command.make("PauseMood", { args: { ms: Schema.Number, seq: Schema.Number } }, ({ ms, seq }) =>
  Effect.sleep(ms).pipe(Effect.as(AuthScreenMessage.CompletedMoodPause({ seq }))))

/** Sign in or create an account, with Juno saying hello. */
export const AuthScreen = Html.component({
  name: "AuthScreen",
  model: Schema.Struct({
    signUp: Schema.Boolean,
    username: Schema.String,
    password: Schema.String,
    inviteCode: Schema.String,
    inviteRequired: Schema.Boolean,
    error: Schema.NullOr(Schema.String),
    submitting: Schema.Boolean,
    mood: Schema.String,
    moodSeq: Schema.Number,
    burstId: Schema.Number,
    pending: Schema.NullOr(Schema.Struct({ token: Schema.String, profile: Profile }))
  }),
  message: AuthScreenMessage,
  events: AuthScreenEvents,
  // A password never goes into browser history.
  restore: (model) => ({ ...model, password: "", submitting: false, pending: null })
}).make({
  init: ($) =>
    $.set({
      signUp: false,
      username: "",
      password: "",
      inviteCode: "",
      inviteRequired: false,
      error: null,
      submitting: false,
      mood: "excited",
      moodSeq: 1,
      burstId: 0,
      pending: null
    }).run(LoadAuthConfig.make({})).run(PauseMood.make({ ms: 1600, seq: 1 })),
  update: {
    ClickedSignInTab: ($) => $.evolve({ signUp: false, error: null }),
    ClickedSignUpTab: ($) => $.evolve({ signUp: true, error: null }),
    UpdatedUsername: ($, { value }) => $.evolve({ username: value }),
    UpdatedPassword: ($, { value }) => $.evolve({ password: value }),
    UpdatedInvite: ($, { value }) => $.evolve({ inviteCode: value }),
    SubmittedAuthForm: ($) =>
      $.model.submitting
        ? $.model
        : $.evolve({ submitting: true, error: null, mood: "thinking", moodSeq: (n) => n + 1 }).run(
          Authenticate.make({
            signUp: $.model.signUp,
            username: $.model.username,
            password: $.model.password,
            inviteCode: $.model.inviteCode
          })
        ),
    PressedAvatar: ($) =>
      $.evolve({ mood: "playful", moodSeq: (n) => n + 1 }).run(PauseMood.make({ ms: 1400, seq: $.model.moodSeq + 1 })),
    SucceededLoadAuthConfig: ($, { inviteRequired }) => $.evolve({ inviteRequired }),
    SucceededAuthenticate: ($, { profile, token }) =>
      $.evolve({ mood: "celebrating", moodSeq: (n) => n + 1, burstId: (n) => n + 1, pending: { token, profile }, password: "" })
        .run(WaitForWelcome.make({})),
    FailedAuthenticate: ($, { reason }) =>
      $.evolve({ submitting: false, error: reason, mood: "concerned", moodSeq: (n) => n + 1 })
        .run(PauseMood.make({ ms: 2200, seq: $.model.moodSeq + 1 })),
    CompletedWelcome: ($) =>
      $.model.pending === null
        ? $.model
        : $.evolve({ submitting: false }).emit(AuthScreenEvents.SignedIn($.model.pending)),
    CompletedMoodPause: ($, { seq }) => (seq === $.model.moodSeq ? $.evolve({ mood: "happy" }) : $.model)
  },
  view: (h, model) =>
    h.main.class("screen", "auth").children(
      FxLayer(h, { burstId: model.burstId, effect: "confetti", season: "" }),
      h.button.class("avatar-btn").attrs({ type: "button", "aria-label": "Say hi to Juno" }).on("click", AuthScreenMessage.PressedAvatar()).children(
        Avatar(h, { props: { uid: "auth", skin: "juno", mood: model.mood, talking: false, accessory: null, image: null, name: "Juno" } })
      ),
      h.h1("Hi, I'm Juno"),
      h.p.class("lead").children("Your personal assistant. I learn what matters to you."),
      h.div.class("seg").attr("role", "tablist").children(
        h.button.class(!model.signUp && "on").attrs({ type: "button", role: "tab", "aria-selected": String(!model.signUp) })
          .on("click", AuthScreenMessage.ClickedSignInTab()).children("Sign in"),
        h.button.class(model.signUp && "on").attrs({ type: "button", role: "tab", "aria-selected": String(model.signUp) })
          .on("click", AuthScreenMessage.ClickedSignUpTab()).children("Create account")
      ),
      h.form.class("fields").attr("aria-label", model.signUp ? "Create account" : "Sign in").on("submit", AuthScreenMessage.SubmittedAuthForm()).children(
        h.input.attrs({ type: "text", placeholder: "Username", autocapitalize: "off", autocomplete: "username", "aria-label": "Username" })
          .value(model.username).on("input", ({ value }) => AuthScreenMessage.UpdatedUsername({ value })),
        h.input.attrs({
          type: "password",
          placeholder: model.signUp ? "Password (8+ characters)" : "Password",
          autocomplete: model.signUp ? "new-password" : "current-password",
          "aria-label": "Password"
        }).value(model.password).on("input", ({ value }) => AuthScreenMessage.UpdatedPassword({ value })),
        model.signUp && model.inviteRequired &&
          h.input.attrs({ type: "text", placeholder: "Invite code", autocapitalize: "off", "aria-label": "Invite code" })
            .value(model.inviteCode).on("input", ({ value }) => AuthScreenMessage.UpdatedInvite({ value })),
        h.button.class("btn", "primary", "wide").attrs({ type: "submit" }).disabled(model.submitting).children(
          model.submitting ? "One moment…" : model.signUp ? "Create account" : "Sign in"
        ),
        h.p.class("err").attr("role", "alert").children(model.error ?? "")
      )
    )
})
