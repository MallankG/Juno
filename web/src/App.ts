import { Command, Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"
import { ChatLine, decodeProfile, Profile } from "./domain/Profile.ts"
import { AuthScreen } from "./pages/AuthScreen.ts"
import { Home } from "./pages/Home.ts"
import { ApiFailure, call, TOKEN_KEY } from "./platform/api.ts"

const Phase = Schema.Literals(["Booting", "SignedOut", "SignedIn"])

export const AppMessage = UiSchema.TaggedEnum({
  SucceededLoadProfile: { profile: Profile },
  FailedLoadProfile: { signedOut: Schema.Boolean },
  SignedIn: { token: Schema.String, profile: Profile },
  SignedOut: {},
  ChangedProfile: { profile: Profile }
})

const LoadProfile = Command.make("LoadProfile", { args: { token: Schema.String } }, ({ token }) =>
  Effect.tryPromise(async () => decodeProfile(await call(token, "/eve/v1/account"))).pipe(
    Effect.match({
      onSuccess: (profile) => AppMessage.SucceededLoadProfile({ profile }),
      onFailure: (error) => {
        const cause = error.cause
        return AppMessage.FailedLoadProfile({ signedOut: !(cause instanceof ApiFailure) || cause.status === 401 || cause.status === 403 })
      }
    })
  ))

const SaveToken = Command.make("SaveToken", { args: { token: Schema.NullOr(Schema.String) } }, ({ token }) =>
  Effect.sync(() => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      // private browsing
    }
    return Component.noop
  }))

/** Signs people in, then hands them to Juno. */
export const App = Html.component({
  name: "App",
  props: Schema.Struct({
    token: Schema.NullOr(Schema.String),
    history: Schema.Array(ChatLine),
    sessionId: Schema.NullOr(Schema.String),
    speakOn: Schema.Boolean,
    seasonOn: Schema.Boolean,
    connectedGoogle: Schema.Boolean
  }),
  model: Schema.Struct({
    phase: Phase,
    token: Schema.NullOr(Schema.String),
    profile: Schema.NullOr(Profile),
    fresh: Schema.Boolean,
    offline: Schema.Boolean
  }),
  message: AppMessage
}).make({
  init: ($) =>
    $.props.token
      ? $.set({ phase: "Booting", token: $.props.token, profile: null, fresh: false, offline: false }).run(LoadProfile.make({ token: $.props.token }))
      : { phase: "SignedOut" as const, token: null, profile: null, fresh: true, offline: false },
  update: {
    SucceededLoadProfile: ($, { profile }) => $.evolve({ phase: "SignedIn", profile }),
    FailedLoadProfile: ($, { signedOut }) =>
      signedOut
        ? $.evolve({ phase: "SignedOut", token: null, profile: null }).run(SaveToken.make({ token: null }))
        : $.evolve({ offline: true }),
    SignedIn: ($, { profile, token }) =>
      $.evolve({ phase: "SignedIn", token, profile, fresh: true }).run(SaveToken.make({ token })),
    SignedOut: ($) => $.evolve({ phase: "SignedOut", token: null, profile: null, fresh: true }).run(SaveToken.make({ token: null })),
    ChangedProfile: ($, { profile }) => $.evolve({ profile })
  },
  view: (h, model) => {
    if (model.phase === "SignedIn" && model.token && model.profile) {
      const p = h.props
      return Home(h, {
        props: {
          token: model.token,
          profile: model.profile,
          initialHistory: model.fresh ? [] : p.history,
          initialSessionId: model.fresh ? null : p.sessionId,
          initialSpeakOn: p.speakOn,
          initialSeasonOn: p.seasonOn,
          connectedGoogle: p.connectedGoogle
        },
        onEmit: {
          SignedOut: () => AppMessage.SignedOut(),
          ChangedProfile: ({ profile }) => AppMessage.ChangedProfile({ profile })
        }
      })
    }
    if (model.phase === "SignedOut") {
      return AuthScreen(h, {
        onEmit: {
          SignedIn: ({ profile, token }) => AppMessage.SignedIn({ token, profile })
        }
      })
    }
    return h.main.class("screen", "boot").children(
      h.div.class("boot-dot"),
      h.p(model.offline ? "Can't reach Juno right now. Check your connection and reopen the app." : "Waking Juno up…")
    )
  }
})
