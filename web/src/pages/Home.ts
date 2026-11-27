import { Command, Component, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Queue, Schema, Stream } from "effect"
import { Avatar, FaceArt } from "../components/Avatar.ts"
import { FxLayer } from "../components/FxLayer.ts"
import { isMood, SKIN_IDS, skinOf } from "../domain/Face.ts"
import { ChatLine, decodeProfile, firstName, Profile } from "../domain/Profile.ts"
import { call, failureOf, followTurn, type StreamEvent, streamTail } from "../platform/api.ts"
import * as Voice from "../platform/voice.ts"

// ---- Schemas -------------------------------------------------------------------

const Phase = Schema.Literals(["Idle", "Listening", "Transcribing", "Thinking", "Speaking"])
const Sheet = Schema.Literals(["None", "History", "Settings"])
const Approval = Schema.Struct({ interactionId: Schema.String, label: Schema.String, answer: Schema.NullOr(Schema.String) })
const Turn = Schema.Struct({ sessionId: Schema.String, startIndex: Schema.Number, seq: Schema.Number })
const SettingsForm = Schema.Struct({
  name: Schema.String,
  skin: Schema.String,
  month: Schema.String,
  day: Schema.String,
  timezone: Schema.String
})
type SettingsForm = typeof SettingsForm.Type

export const HomeMessage = UiSchema.TaggedEnum({
  PressedMic: {},
  PressedAvatar: {},
  ClickedKeyboard: {},
  ClickedVoiceMode: {},
  UpdatedDraft: { value: Schema.String },
  SubmittedDraft: {},
  ClickedSuggestion: { text: Schema.String },
  ClickedFestiveBanner: {},
  ClickedHistory: {},
  ClickedSettings: {},
  RequestedCloseSheet: {},
  ClickedNewChat: {},
  UpdatedName: { value: Schema.String },
  PickedSkin: { skin: Schema.String },
  UpdatedBirthMonth: { value: Schema.String },
  UpdatedBirthDay: { value: Schema.String },
  UpdatedTimezone: { value: Schema.String },
  ClickedSaveSettings: {},
  ToggledSpeak: { checked: Schema.Boolean },
  ToggledSeason: { checked: Schema.Boolean },
  ClickedConnectGoogle: {},
  ClickedDisconnectGoogle: {},
  ClickedRemoveRule: { id: Schema.String },
  ClickedEnablePush: {},
  ClickedTestPush: {},
  ClickedSignOut: {},
  ClickedApproval: { interactionId: Schema.String, optionId: Schema.String },
  SucceededSendChat: { sessionId: Schema.String, startIndex: Schema.Number },
  FailedSendChat: { reason: Schema.String, status: Schema.Number, sessionEnded: Schema.Boolean },
  ReportedActivity: { label: Schema.String },
  ReceivedReplyText: { text: Schema.String },
  PausedTurn: { approvals: Schema.Array(Schema.Struct({ interactionId: Schema.String, label: Schema.String })) },
  SettledTurn: { outcome: Schema.String },
  EndedSession: {},
  LostTurnStream: {},
  SucceededStartRecording: {},
  FailedStartRecording: { reason: Schema.String },
  SucceededTranscribe: { text: Schema.String },
  FailedTranscribe: { reason: Schema.String },
  CompletedSpeak: {},
  FailedSpeak: { reason: Schema.String },
  SucceededAnswerApproval: {},
  FailedAnswerApproval: { reason: Schema.String },
  SucceededUpdateProfile: { profile: Profile, note: Schema.String },
  FailedAccountAction: { reason: Schema.String },
  CompletedPushAction: { text: Schema.String },
  RequestedCelebration: {},
  CompletedMoodPause: { seq: Schema.Number },
  CompletedToastPause: { id: Schema.Number }
})
type HomeMessage = typeof HomeMessage.Type

export const HomeEvents = UiSchema.TaggedEnum({
  SignedOut: {},
  ChangedProfile: { profile: Profile }
})

// ---- Commands ------------------------------------------------------------------

const reasonOf = (error: { readonly cause?: unknown }) => failureOf(error.cause ?? error)

const SendChat = Command.make(
  "SendChat",
  { args: { token: Schema.String, sessionId: Schema.NullOr(Schema.String), text: Schema.String } },
  ({ sessionId, text, token }) =>
    Effect.tryPromise(async () => {
      if (sessionId) {
        const startIndex = await streamTail(token, sessionId)
        await call(token, `/eve/v1/session/${sessionId}`, { body: { message: text } })
        return { sessionId, startIndex }
      }
      const created = (await call(token, "/eve/v1/session", { body: { message: text } })) as { sessionId: string }
      return { sessionId: created.sessionId, startIndex: 0 }
    }).pipe(
      Effect.match({
        onSuccess: (r) => HomeMessage.SucceededSendChat(r),
        onFailure: (error) => {
          const { reason, status } = reasonOf(error)
          return HomeMessage.FailedSendChat({
            reason,
            status,
            sessionEnded: status === 409 || status === 410 || /no longer active/i.test(reason)
          })
        }
      })
    )
)

const AnswerApproval = Command.make(
  "AnswerApproval",
  { args: { token: Schema.String, sessionId: Schema.String, interactionId: Schema.String, optionId: Schema.String } },
  ({ interactionId, optionId, sessionId, token }) =>
    Effect.tryPromise(() => call(token, `/eve/v1/session/${sessionId}`, { body: { answers: [{ interactionId, optionId }] } })).pipe(
      Effect.match({
        onSuccess: () => HomeMessage.SucceededAnswerApproval(),
        onFailure: (error) => HomeMessage.FailedAnswerApproval({ reason: reasonOf(error).reason })
      })
    )
)

const StartRecording = Command.make("StartRecording", {}, () =>
  Effect.tryPromise(() => Voice.startRecording()).pipe(
    Effect.match({
      onSuccess: () => HomeMessage.SucceededStartRecording(),
      onFailure: (error) => HomeMessage.FailedStartRecording({ reason: reasonOf(error).reason })
    })
  ))

const StopAndTranscribe = Command.make("StopAndTranscribe", { args: { token: Schema.String } }, ({ token }) =>
  Effect.tryPromise(() => Voice.stopAndTranscribe(token)).pipe(
    Effect.match({
      onSuccess: (text) => HomeMessage.SucceededTranscribe({ text }),
      onFailure: (error) => HomeMessage.FailedTranscribe({ reason: reasonOf(error).reason })
    })
  ))

const Speak = Command.make("Speak", { args: { token: Schema.String, text: Schema.String } }, ({ text, token }) =>
  Effect.tryPromise(() => Voice.speak(token, text)).pipe(
    Effect.match({
      onSuccess: () => HomeMessage.CompletedSpeak(),
      onFailure: (error) => HomeMessage.FailedSpeak({ reason: reasonOf(error).reason })
    })
  ))

// With voice off, Juno still "talks" for as long as it takes to read the reply.
const PauseForReading = Command.make("PauseForReading", { args: { ms: Schema.Number } }, ({ ms }) =>
  Effect.sleep(ms).pipe(Effect.as(HomeMessage.CompletedSpeak())))

const StopVoice = Command.make("StopVoice", {}, () =>
  Effect.sync(() => {
    Voice.stopSpeaking()
    Voice.cancelRecording()
    return Component.noop
  }))

const PauseMood = Command.make("PauseMood", { args: { ms: Schema.Number, seq: Schema.Number } }, ({ ms, seq }) =>
  Effect.sleep(ms).pipe(Effect.as(HomeMessage.CompletedMoodPause({ seq }))))

const PauseToast = Command.make("PauseToast", { args: { id: Schema.Number } }, ({ id }) =>
  Effect.sleep(2800).pipe(Effect.as(HomeMessage.CompletedToastPause({ id }))))

const SaveLocal = Command.make("SaveLocal", { args: { key: Schema.String, value: Schema.NullOr(Schema.String) } }, ({ key, value }) =>
  Effect.sync(() => {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // storage can be unavailable in private browsing
    }
    return Component.noop
  }))

// Celebrate once per festival day on this phone.
const CheckCelebration = Command.make("CheckCelebration", { args: { key: Schema.String } }, ({ key }) =>
  Effect.sync(() => {
    try {
      if (localStorage.getItem(key)) return Component.noop
      localStorage.setItem(key, "1")
    } catch {
      return Component.noop
    }
    return HomeMessage.RequestedCelebration()
  }).pipe(Effect.delay(700)))

const accountCall = (token: string, path: string, body: unknown, note: string) =>
  Effect.tryPromise(async () => decodeProfile(await call(token, path, { body }))).pipe(
    Effect.match({
      onSuccess: (profile) => HomeMessage.SucceededUpdateProfile({ profile, note }),
      onFailure: (error) => HomeMessage.FailedAccountAction({ reason: reasonOf(error).reason })
    })
  )

const SaveSettings = Command.make(
  "SaveSettings",
  { args: { token: Schema.String, form: SettingsForm } },
  ({ form, token }) =>
    accountCall(token, "/eve/v1/account/settings", {
      agentName: form.name,
      avatar: form.skin,
      timezone: form.timezone,
      birthday: form.month && form.day ? `${form.month}-${form.day}` : ""
    }, "Saved")
)

const DisconnectGoogle = Command.make("DisconnectGoogle", { args: { token: Schema.String } }, ({ token }) =>
  accountCall(token, "/eve/v1/google/disconnect", {}, "Google disconnected"))

const RemoveRule = Command.make("RemoveRule", { args: { token: Schema.String, id: Schema.String } }, ({ id, token }) =>
  accountCall(token, "/eve/v1/account/rules/remove", { id }, "Rule removed"))

const ConnectGoogle = Command.make("ConnectGoogle", { args: { token: Schema.String } }, ({ token }) =>
  Effect.tryPromise(() => call(token, "/eve/v1/google/connect-url", { body: {} })).pipe(
    Effect.match({
      onSuccess: (data) => {
        window.location.href = (data as { url: string }).url
        return Component.noop
      },
      onFailure: (error) => HomeMessage.FailedAccountAction({ reason: reasonOf(error).reason })
    })
  ))

const b64ToBytes = (s: string) =>
  Uint8Array.from(atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

const EnablePush = Command.make("EnablePush", { args: { token: Schema.String } }, ({ token }) =>
  Effect.tryPromise(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Add Juno to your home screen first, then try again.")
    }
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked in your phone's settings.")
    const { publicKey, reason } = (await call("", "/eve/v1/push/key")) as { publicKey: string | null; reason?: string }
    if (!publicKey) throw new Error(reason ?? "Notifications aren't set up yet.")
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) })
    await call(token, "/eve/v1/push/subscribe", { body: subscription.toJSON() })
  }).pipe(
    Effect.match({
      onSuccess: () => HomeMessage.CompletedPushAction({ text: "Notifications are on" }),
      onFailure: (error) => HomeMessage.CompletedPushAction({ text: reasonOf(error).reason })
    })
  ))

const TestPush = Command.make("TestPush", { args: { token: Schema.String } }, ({ token }) =>
  Effect.tryPromise(() => call(token, "/eve/v1/push/test", { body: {} })).pipe(
    Effect.match({
      onSuccess: (data) => HomeMessage.CompletedPushAction({ text: (data as { sent?: number }).sent ? "Sent. Check your notifications" : "No device is subscribed yet" }),
      onFailure: (error) => HomeMessage.CompletedPushAction({ text: reasonOf(error).reason })
    })
  ))

// ---- The live turn ------------------------------------------------------------------

const humanize = (s: string) => {
  const t = s.replace(/^.*__/, "").replace(/_/g, " ").trim()
  return t ? t[0]!.toUpperCase() + t.slice(1) : t
}

const messageOf = (event: StreamEvent): HomeMessage | null => {
  const d = event.data
  switch (event.type) {
    case "call.requested": {
      const cap = d.capability as { label?: string; name?: string; hidden?: boolean } | undefined
      if (!cap || cap.hidden) return null
      const label = humanize(cap.label ?? cap.name ?? "")
      return label ? HomeMessage.ReportedActivity({ label }) : null
    }
    case "content.completed":
      return d.phase === "reply" && d.kind === "text" && typeof d.value === "string" ? HomeMessage.ReceivedReplyText({ text: d.value }) : null
    case "turn.paused": {
      const awaiting = Array.isArray(d.awaiting) ? (d.awaiting as Array<Record<string, unknown>>) : []
      return HomeMessage.PausedTurn({
        approvals: awaiting.map((item) => ({
          interactionId: String(item.interactionId ?? ""),
          label: String(item.title ?? item.prompt ?? item.label ?? "Juno wants to do something for you.")
        }))
      })
    }
    case "turn.settled":
      return HomeMessage.SettledTurn({ outcome: String(d.outcome ?? "completed") })
    case "session.ended":
      return HomeMessage.EndedSession()
    default:
      return null
  }
}

const turnEvents = (token: string, sessionId: string, startIndex: number) =>
  Stream.callback<HomeMessage>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController()
        const finish = () => {
          Queue.offerUnsafe(queue, HomeMessage.LostTurnStream())
          Queue.endUnsafe(queue)
        }
        followTurn(token, sessionId, startIndex, (event) => {
          const message = messageOf(event)
          if (message) Queue.offerUnsafe(queue, message)
        }, controller.signal).then(finish, finish)
        return controller
      }),
      (controller) => Effect.sync(() => controller.abort())
    ))

// ---- Helpers ---------------------------------------------------------------------

const MOOD_TAG = /\[\s*mood\s*:\s*([a-z-]+)\s*\]\s*/i
const parseMood = (raw: string): { readonly mood: string | null; readonly text: string } => {
  const m = MOOD_TAG.exec(raw)
  const mood = m?.[1]?.toLowerCase() ?? null
  return { mood: mood && isMood(mood) ? mood : null, text: raw.replace(/\[\s*mood\s*:\s*[a-z-]+\s*\]\s*/gi, "").trim() }
}

const restMoodFor = (profile: Profile) => (profile.today.partOfDay === "night" ? "sleepy" : "neutral")

const greetingFor = (profile: Profile) => {
  const t = profile.today
  if (t.festival) return `${t.festival.greeting}! What can I do for you today?`
  if (t.partOfDay === "morning") return "Morning! Want your brief, or shall we plan the day?"
  if (t.partOfDay === "night") return "Still up? I'm here if you need me."
  return "I'm here. Ask me anything, or tap a suggestion."
}

const formFor = (profile: Profile): SettingsForm => {
  const [month, day] = (profile.birthday ?? "-").split("-")
  return { name: profile.agentName, skin: profile.avatar, month: month ?? "", day: day ?? "", timezone: profile.timezone }
}

const suggestionsFor = (profile: Profile): ReadonlyArray<readonly [string, string]> => {
  const t = profile.today
  const ideas: Array<readonly [string, string]> = []
  if (t.festival && t.festival.id !== "anniversary") ideas.push([`${t.festival.emoji} Celebrate`, `It's ${t.festival.name}! Any ideas to make today special?`])
  if (t.partOfDay === "morning") ideas.push(["My brief", "What's my morning brief? Keep it short."], ["Plan my day", "Plan my day around my calendar. What should I do first?"])
  else if (t.partOfDay === "evening" || t.partOfDay === "night") ideas.push(["Tomorrow", "What's on tomorrow, and how should I prepare tonight?"], ["Wind down", "Help me wind down. How did today go?"])
  else ideas.push(["What's next?", "What's next on my calendar today?"], ["Plan my day", "Plan the rest of my day. What should I focus on?"])
  ideas.push(["Triage mail", "Look through my unread mail and draft replies where needed."], ["Next meeting", "Prep me for my next meeting."], ["About me", "What do you know about me?"])
  return ideas
}

const TICKLES = ["Hehe, that tickles!", "Hi there!", "I'm all ears.", "Boop!", "Ready when you are."]

// ---- Component ---------------------------------------------------------------------

const HomeModelSchema = Schema.Struct({
    phase: Phase,
mood: Schema.String,
    moodSeq: Schema.Number,
    activity: Schema.String,
    note: Schema.String,
    you: Schema.String,
    reply: Schema.String,
    replyBuffer: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
    turn: Schema.NullOr(Turn),
    turnSeq: Schema.Number,
    retried: Schema.Boolean,
    approvals: Schema.Array(Approval),
    history: Schema.Array(ChatLine),
    typing: Schema.Boolean,
    draft: Schema.String,
    burstId: Schema.Number,
    burstEffect: Schema.String,
    speakOn: Schema.Boolean,
    seasonOn: Schema.Boolean,
    sheet: Sheet,
    form: SettingsForm,
    saving: Schema.Boolean,
    toast: Schema.NullOr(Schema.Struct({ id: Schema.Number, text: Schema.String })),
    pushNote: Schema.String
  })

const HomeDef = Html.component({
  name: "Home",
  props: Schema.Struct({
    token: Schema.String,
    profile: Profile,
    initialHistory: Schema.Array(ChatLine),
    initialSessionId: Schema.NullOr(Schema.String),
    initialSpeakOn: Schema.Boolean,
    initialSeasonOn: Schema.Boolean,
    connectedGoogle: Schema.Boolean
  }),
  model: HomeModelSchema,
  message: HomeMessage,
  events: HomeEvents,
  restore: (model) => ({ ...model, phase: "Idle" as const, turn: null, sheet: "None" as const, saving: false })
})

type HomeModel = typeof HomeModelSchema.Type

const rememberHistory = (history: ReadonlyArray<ChatLine>) =>
  SaveLocal.make({ key: "junoHistory", value: JSON.stringify(history.slice(-60)) })


const startTurn = (model: HomeModel, token: string, text: string) => {
  const history = [...model.history, { role: "u" as const, text }].slice(-60)
  return {
    next: {
      ...model,
      phase: "Thinking" as const,
      mood: "thinking",
      moodSeq: model.moodSeq + 1,
      activity: "",
      note: "",
      you: text,
      reply: "",
      replyBuffer: "",
      approvals: [],
      history,
      retried: false,
      draft: ""
    },
    commands: [Voice.stopSpeaking, SendChat.make({ token, sessionId: model.sessionId, text }), rememberHistory(history)] as const
  }
}

export const Home = HomeDef.make({
  init: ($) => {
    const profile = $.props.profile
    const last = [...$.props.initialHistory].reverse().find((line) => line.role === "a")
    const festival = profile.today.festival
    const step = $.set({
      phase: "Idle",
      mood: festival ? "excited" : "happy",
      moodSeq: 1,
      activity: "",
      note: "",
      you: "",
      reply: last ? last.text : greetingFor(profile),
      replyBuffer: "",
      sessionId: $.props.initialSessionId,
      turn: null,
      turnSeq: 0,
      retried: false,
      approvals: [],
      history: [...$.props.initialHistory],
      typing: false,
      draft: "",
      burstId: 0,
      burstEffect: "confetti",
      speakOn: $.props.initialSpeakOn,
      seasonOn: $.props.initialSeasonOn,
      sheet: "None",
      form: formFor(profile),
      saving: false,
      toast: $.props.connectedGoogle ? { id: 1, text: "Google connected" } : null,
      pushNote: ""
    }).run(PauseMood.make({ ms: 4000, seq: 1 }))
    const withToast = $.props.connectedGoogle ? step.run(PauseToast.make({ id: 1 })).run(CheckCelebration.make({ key: `google-connected-${Date.now()}` })) : step
    return festival ? withToast.run(CheckCelebration.make({ key: `celebrated-${profile.today.date}-${festival.id}` })) : withToast
  },
  update: {
    PressedMic: ($) => {
      const token = $.props.token
      if ($.model.phase === "Listening") return $.evolve({ phase: "Transcribing", mood: "curious", moodSeq: (n) => n + 1 }).run(StopAndTranscribe.make({ token }))
      if ($.model.phase === "Idle" || $.model.phase === "Speaking") {
        return $.evolve({ phase: "Listening", mood: "listening", moodSeq: (n) => n + 1, note: "" }).run(StopVoice.make({})).run(StartRecording.make({}))
      }
      return $.model
    },
    PressedAvatar: ($) =>
      $.model.phase !== "Idle"
        ? $.model
        : $.evolve({
          mood: "playful",
          moodSeq: (n) => n + 1,
          note: TICKLES[$.model.moodSeq % TICKLES.length] ?? "Hi!",
          burstId: (n) => ($.model.moodSeq % 3 === 0 ? n + 1 : n),
          burstEffect: "sparkles"
        }).run(PauseMood.make({ ms: 1800, seq: $.model.moodSeq + 1 })),
    ClickedKeyboard: ($) => $.evolve({ typing: true }),
    ClickedVoiceMode: ($) => $.evolve({ typing: false }),
    UpdatedDraft: ($, { value }) => $.evolve({ draft: value }),
    SubmittedDraft: ($) => {
      const text = $.model.draft.trim()
      if (!text || $.model.phase === "Thinking" || $.model.phase === "Transcribing") return $.model
      const { commands, next } = startTurn($.model, $.props.token, text)
      return $.set(next).run(StopVoice.make({})).run(commands[1]).run(commands[2])
    },
    ClickedSuggestion: ($, { text }) => {
      if ($.model.phase === "Thinking" || $.model.phase === "Transcribing" || $.model.phase === "Listening") return $.model
      const { commands, next } = startTurn($.model, $.props.token, text)
      return $.set(next).run(StopVoice.make({})).run(commands[1]).run(commands[2])
    },
    ClickedFestiveBanner: ($) => {
      const f = $.props.profile.today.festival
      return $.evolve({ mood: "celebrating", moodSeq: (n) => n + 1, burstId: (n) => n + 1, burstEffect: f?.effect ?? "confetti" })
        .run(PauseMood.make({ ms: 3500, seq: $.model.moodSeq + 1 }))
    },
    ClickedHistory: ($) => $.evolve({ sheet: "History" }),
    ClickedSettings: ($) => $.evolve({ sheet: "Settings", form: formFor($.props.profile), pushNote: "" }),
    RequestedCloseSheet: ($) => $.evolve({ sheet: "None" }),
    ClickedNewChat: ($) =>
      $.evolve({ sheet: "None", sessionId: null, history: [], you: "", reply: greetingFor($.props.profile), approvals: [], mood: "happy", moodSeq: (n) => n + 1 })
        .run(SaveLocal.make({ key: "junoHistory", value: null }))
        .run(SaveLocal.make({ key: "sessionId", value: null })),
    UpdatedName: ($, { value }) => $.evolve({ form: { ...$.model.form, name: value } }),
    PickedSkin: ($, { skin }) => $.evolve({ form: { ...$.model.form, skin }, mood: "excited", moodSeq: (n) => n + 1 }).run(PauseMood.make({ ms: 1200, seq: $.model.moodSeq + 1 })),
    UpdatedBirthMonth: ($, { value }) => $.evolve({ form: { ...$.model.form, month: value } }),
    UpdatedBirthDay: ($, { value }) => $.evolve({ form: { ...$.model.form, day: value } }),
    UpdatedTimezone: ($, { value }) => $.evolve({ form: { ...$.model.form, timezone: value } }),
    ClickedSaveSettings: ($) => ($.model.saving ? $.model : $.evolve({ saving: true }).run(SaveSettings.make({ token: $.props.token, form: $.model.form }))),
    ToggledSpeak: ($, { checked }) => {
      const step = $.evolve({ speakOn: checked }).run(SaveLocal.make({ key: "speak", value: checked ? "on" : "off" }))
      return checked ? step : step.run(StopVoice.make({}))
    },
    ToggledSeason: ($, { checked }) => $.evolve({ seasonOn: checked }).run(SaveLocal.make({ key: "season", value: checked ? "on" : "off" })),
    ClickedConnectGoogle: ($) => $.run(ConnectGoogle.make({ token: $.props.token })),
    ClickedDisconnectGoogle: ($) => $.run(DisconnectGoogle.make({ token: $.props.token })),
    ClickedRemoveRule: ($, { id }) => $.run(RemoveRule.make({ token: $.props.token, id })),
    ClickedEnablePush: ($) => $.evolve({ pushNote: "Asking your phone…" }).run(EnablePush.make({ token: $.props.token })),
    ClickedTestPush: ($) => $.run(TestPush.make({ token: $.props.token })),
    ClickedSignOut: ($) =>
      $.evolve({ sheet: "None" })
        .run(StopVoice.make({}))
        .run(SaveLocal.make({ key: "junoHistory", value: null }))
        .run(SaveLocal.make({ key: "sessionId", value: null }))
        .emit(HomeEvents.SignedOut()),
    ClickedApproval: ($, { interactionId, optionId }) =>
      $.model.sessionId === null
        ? $.model
        : $.evolve({
          approvals: $.model.approvals.map((a) => (a.interactionId === interactionId ? { ...a, answer: optionId } : a)),
          phase: "Thinking",
          mood: optionId === "approve" ? "happy" : "calm",
          moodSeq: (n) => n + 1
        }).run(AnswerApproval.make({ token: $.props.token, sessionId: $.model.sessionId, interactionId, optionId })),
    SucceededSendChat: ($, { sessionId, startIndex }) =>
      $.evolve({ sessionId, turn: { sessionId, startIndex, seq: $.model.turnSeq + 1 }, turnSeq: (n) => n + 1 })
        .run(SaveLocal.make({ key: "sessionId", value: sessionId })),
    FailedSendChat: ($, { reason, sessionEnded, status }) => {
      // The old conversation ended on the server: start a fresh one with the same words, once.
      if (sessionEnded && !$.model.retried) {
        return $.evolve({ sessionId: null, retried: true }).run(SendChat.make({ token: $.props.token, sessionId: null, text: $.model.you }))
      }
      return $.evolve({ phase: "Idle", turn: null, reply: reason, mood: status === 429 ? "sleepy" : "concerned", moodSeq: (n) => n + 1 })
        .run(PauseMood.make({ ms: 5000, seq: $.model.moodSeq + 1 }))
    },
    ReportedActivity: ($, { label }) => $.evolve({ activity: label }),
    ReceivedReplyText: ($, { text }) => $.evolve({ replyBuffer: (b) => (b ? `${b}\n\n${text}` : text) }),
    PausedTurn: ($, { approvals }) =>
      $.evolve({
        approvals: [...$.model.approvals, ...approvals.map((a) => ({ ...a, answer: null }))],
        mood: "curious",
        moodSeq: (n) => n + 1,
        activity: "Waiting for your OK"
      }),
    SettledTurn: ($, { outcome }) => {
      const { mood, text } = parseMood($.model.replyBuffer)
      if (!text) {
        const failed = outcome !== "completed"
        return $.evolve({
          phase: "Idle",
          turn: null,
          activity: "",
          reply: failed ? "I couldn't finish that. Could you try again in a moment?" : $.model.reply,
          mood: failed ? "concerned" : "neutral",
          moodSeq: (n) => n + 1
        }).run(PauseMood.make({ ms: 5000, seq: $.model.moodSeq + 1 }))
      }
      const history = [...$.model.history, { role: "a" as const, text }].slice(-60)
      const m = mood ?? "happy"
      const celebrate = m === "celebrating" || m === "excited" || m === "proud"
      const step = $.evolve({
        phase: "Speaking",
        turn: null,
        activity: "",
        reply: text,
        replyBuffer: "",
        history,
        mood: m,
        moodSeq: (n) => n + 1,
        burstId: (n) => (celebrate ? n + 1 : n),
        burstEffect: m === "celebrating" ? "confetti" : "sparkles"
      }).run(rememberHistory(history))
      return $.model.speakOn
        ? step.run(Speak.make({ token: $.props.token, text }))
        : step.run(PauseForReading.make({ ms: Math.min(4000, 600 + text.length * 18) }))
    },
    EndedSession: ($) => $.evolve({ sessionId: null }).run(SaveLocal.make({ key: "sessionId", value: null })),
    LostTurnStream: ($) =>
      $.model.turn === null
        ? $.model
        : $.evolve({ phase: "Idle", turn: null, activity: "", reply: "I lost the connection. Could you say that again?", mood: "concerned", moodSeq: (n) => n + 1 }),
    SucceededStartRecording: ($) => $.model,
    FailedStartRecording: ($, { reason }) => $.evolve({ phase: "Idle", note: reason, mood: "concerned", moodSeq: (n) => n + 1 }).run(PauseMood.make({ ms: 3000, seq: $.model.moodSeq + 1 })),
    SucceededTranscribe: ($, { text }) => {
      if (!text) return $.evolve({ phase: "Idle", note: "I didn't catch that. Try again?", mood: "curious", moodSeq: (n) => n + 1 }).run(PauseMood.make({ ms: 2500, seq: $.model.moodSeq + 1 }))
      const { commands, next } = startTurn($.model, $.props.token, text)
      return $.set(next).run(commands[1]).run(commands[2])
    },
    FailedTranscribe: ($, { reason }) => $.evolve({ phase: "Idle", note: reason, mood: "concerned", moodSeq: (n) => n + 1 }).run(PauseMood.make({ ms: 3000, seq: $.model.moodSeq + 1 })),
    CompletedSpeak: ($) =>
      $.model.phase !== "Speaking" ? $.model : $.evolve({ phase: "Idle" }).run(PauseMood.make({ ms: 5000, seq: $.model.moodSeq })),
    FailedSpeak: ($, { reason }) =>
      $.evolve({ phase: "Idle", note: reason.startsWith("Please sign in") ? reason : "Voice is unavailable right now." }).run(PauseMood.make({ ms: 5000, seq: $.model.moodSeq })),
    SucceededAnswerApproval: ($) => $.model,
    FailedAnswerApproval: ($, { reason }) => $.evolve({ phase: "Idle", note: reason, mood: "concerned", moodSeq: (n) => n + 1 }),
    SucceededUpdateProfile: ($, { note, profile }) =>
      $.evolve({ saving: false, form: formFor(profile), toast: { id: $.model.moodSeq + 1000, text: note }, mood: "happy", moodSeq: (n) => n + 1 })
        .run(PauseToast.make({ id: $.model.moodSeq + 1000 }))
        .emit(HomeEvents.ChangedProfile({ profile })),
    FailedAccountAction: ($, { reason }) =>
      $.evolve({ saving: false, toast: { id: $.model.moodSeq + 2000, text: reason } }).run(PauseToast.make({ id: $.model.moodSeq + 2000 })),
    CompletedPushAction: ($, { text }) => $.evolve({ pushNote: text }),
    RequestedCelebration: ($) => {
      const f = $.props.profile.today.festival
      return $.evolve({ mood: "celebrating", moodSeq: (n) => n + 1, burstId: (n) => n + 1, burstEffect: f?.effect ?? "confetti" })
        .run(PauseMood.make({ ms: 3500, seq: $.model.moodSeq + 1 }))
    },
    CompletedMoodPause: ($, { seq }) =>
      seq !== $.model.moodSeq || $.model.phase !== "Idle"
        ? $.model
        : $.evolve({ mood: restMoodFor($.props.profile), note: "" }),
    CompletedToastPause: ($, { id }) => ($.model.toast?.id === id ? $.evolve({ toast: null }) : $.model)
  },
  subscriptions: ({ model, props }) => [
    model.turn !== null &&
    Subscription.make("turn", `${model.turn.sessionId}|${model.turn.startIndex}|${model.turn.seq}`, (deps) => {
      const [sessionId, startIndex] = deps.split("|")
      return turnEvents(props.token, sessionId ?? "", Number(startIndex))
    })
  ],
  view: (h, model) => {
    const profile = h.props.profile
    const skin = skinOf(profile.avatar)
    const festival = profile.today.festival
    const name = firstName(profile)
    const hello = ({ morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Hello, night owl" } as Record<string, string>)[profile.today.partOfDay] ?? "Hello"
    const status =
      model.phase === "Listening" ? "Listening. Tap to send" :
      model.phase === "Transcribing" ? "Got it…" :
      model.phase === "Thinking" ? (model.activity ? `${model.activity}…` : "Thinking…") :
      model.phase === "Speaking" ? (model.speakOn ? "Tap the mic to interrupt" : "") :
      model.note || `Tap the mic and talk to ${profile.agentName}`
    const date = new Date(`${profile.today.date}T12:00:00`)

    return h.main.class("screen", "home", model.phase === "Listening" && "listening").style({ "--accent": skin.accent, "--glow": skin.glow }).children(
      FxLayer(h, { burstId: model.burstId, effect: model.burstEffect, season: model.seasonOn ? profile.today.season : "" }),
      model.toast && h.div.class("toast").attr("role", "status").children(model.toast.text),

      h.header.class("top").children(
        h.div(
          h.div.class("hello").children(`${hello}${name ? `, ${name}` : ""}`),
          h.div.class("dateline").children(`${profile.today.weekday} · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`)
        ),
        h.button.class("icon-btn").attrs({ type: "button", "aria-label": "Settings" }).on("click", HomeMessage.ClickedSettings()).children(
          h.svg.attrs({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }).children(
            h.circle.attrs({ cx: "12", cy: "12", r: "3" }),
            h.path.attrs({ d: "M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" })
          )
        )
      ),

      festival &&
        h.button.class("festive").attrs({ type: "button" }).on("click", HomeMessage.ClickedFestiveBanner()).children(
          h.span.class("emoji").children(festival.emoji),
          h.span(
            `${festival.greeting}${name ? `, ${name}` : ""}!`,
            h.small(festival.id === "birthday" ? "Tap to celebrate again" : `Today is ${festival.name}. Tap to celebrate`)
          )
        ),

      h.section.class("stage").children(
        h.button.class("avatar-btn").attrs({ type: "button", "aria-label": `Talk to ${profile.agentName}` }).on("click", HomeMessage.PressedAvatar()).children(
          h.div.class("ring"),
          Avatar(h, {
            props: {
              uid: "home",
              skin: profile.avatar,
              mood: model.mood,
              talking: model.phase === "Speaking",
              accessory: festival ? festival.accessory : null
            }
          })
        ),
        h.p.class("status", (model.phase === "Thinking" || model.phase === "Transcribing") && "busy").attr("aria-live", "polite").children(status)
      ),

      h.section.class("reply").children(
        model.you && h.p.class("you").children(model.you),
        h.div.key(`say-${model.history.length}-${model.reply.length}`).class("say", model.reply.length > 260 && "small").children(model.reply),
        ...model.approvals.map((a) =>
          h.div.key(a.interactionId).class("card").children(
            h.p(a.label),
            a.answer === null
              ? h.div.class("row").children(
                h.button.class("btn", "primary").attrs({ type: "button" }).on("click", HomeMessage.ClickedApproval({ interactionId: a.interactionId, optionId: "approve" })).children("Yes, do it"),
                h.button.class("btn").attrs({ type: "button" }).on("click", HomeMessage.ClickedApproval({ interactionId: a.interactionId, optionId: "deny" })).children("No")
              )
              : h.p.class("muted").children(a.answer === "approve" ? "Approved" : "Declined")
          )
        )
      ),

      h.nav.class("chips").attr("aria-label", "Suggestions").children(
        ...suggestionsFor(profile).map(([label, text]) =>
          h.button.key(label).class("chip").attrs({ type: "button" }).on("click", HomeMessage.ClickedSuggestion({ text })).children(label)
        )
      ),

      model.typing
        ? h.form.class("typebar").attr("aria-label", "Type a message").on("submit", HomeMessage.SubmittedDraft()).children(
          h.button.class("icon-btn").attrs({ type: "button", "aria-label": "Talk instead" }).on("click", HomeMessage.ClickedVoiceMode()).children(MicIcon(h)),
          h.input.attrs({ type: "text", placeholder: `Message ${profile.agentName}`, enterkeyhint: "send", "aria-label": "Message", autocomplete: "off" })
            .value(model.draft).on("input", ({ value }) => HomeMessage.UpdatedDraft({ value })),
          h.button.class("btn", "primary").attrs({ type: "submit" }).children("Send")
        )
        : h.footer.class("dock").children(
          h.button.class("icon-btn").attrs({ type: "button", "aria-label": "Type a message" }).on("click", HomeMessage.ClickedKeyboard()).children(
            h.svg.attrs({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }).children(
              h.rect.attrs({ x: "2", y: "6", width: "20", height: "12", rx: "2" }),
              h.path.attrs({ d: "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" })
            )
          ),
          h.button.class("mic", model.phase === "Listening" && "rec").attrs({ type: "button", "aria-label": model.phase === "Listening" ? "Send what you said" : "Talk" })
            .disabled(model.phase === "Thinking" || model.phase === "Transcribing").on("click", HomeMessage.PressedMic()).children(
              model.phase === "Listening"
                ? h.svg.attrs({ viewBox: "0 0 24 24" }).children(h.rect.attrs({ x: "7", y: "7", width: "10", height: "10", rx: "2", fill: "currentColor" }))
                : MicIcon(h)
            ),
          h.button.class("icon-btn").attrs({ type: "button", "aria-label": "Conversation" }).on("click", HomeMessage.ClickedHistory()).children(
            h.svg.attrs({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }).children(
              h.path.attrs({ d: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" })
            )
          )
        ),

      HistorySheet(h, model),
      SettingsSheet(h, model, profile)
    )
  }
})


const MicIcon = <M>(h: Html.H<M>) =>
  h.svg.attrs({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round" }).children(
    h.rect.attrs({ x: "9", y: "3", width: "6", height: "11", rx: "3" }),
    h.path.attrs({ d: "M5 11a7 7 0 0 0 14 0M12 18v3" })
  )

const Sheet$ = <M>(h: Html.H<M>, open: boolean, label: string, close: M) =>
  h.dialog.class("sheet").attr("aria-label", label).modal(open).on("cancel", close).on("close", close)

const HistorySheet = (h: Html.H<HomeMessage>, model: HomeModel) =>
  Sheet$(h, model.sheet === "History", "Conversation", HomeMessage.RequestedCloseSheet()).children(
    h.div.class("sheet-in").children(
      h.div.class("grab"),
      h.h2("Conversation"),
      h.div.class("msgs").children(
        model.history.length === 0
          ? h.p("Nothing here yet. Say hello!")
          : false,
        ...model.history.map((line: ChatLine, i: number) => h.div.key(`m${i}`).class("m", line.role).children(line.text))
      ),
      h.div.class("pair").children(
        h.button.class("btn").attrs({ type: "button" }).on("click", HomeMessage.ClickedNewChat()).children("New conversation"),
        h.button.class("btn", "primary").attrs({ type: "button" }).on("click", HomeMessage.RequestedCloseSheet()).children("Done")
      )
    )
  )

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ZONES: ReadonlyArray<string> = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => Array<string> }).supportedValuesOf("timeZone")
  } catch {
    return ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"]
  }
})()
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"))

const SettingsSheet = (h: Html.H<HomeMessage>, model: HomeModel, profile: Profile) => {
  const zones = ZONES.includes(model.form.timezone) ? ZONES : [model.form.timezone, ...ZONES]
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return Sheet$(h, model.sheet === "Settings", "Settings", HomeMessage.RequestedCloseSheet()).children(
    h.div.class("sheet-in").children(
      h.div.class("grab"),
      h.h2(profile.agentName),
      h.p(`Signed in as ${profile.username}`),

      h.h3("Name"),
      h.input.attrs({ type: "text", maxlength: "24", placeholder: "Juno", "aria-label": "Name" })
        .value(model.form.name).on("input", ({ value }) => HomeMessage.UpdatedName({ value })),

      h.h3("Look"),
      h.div.class("skins").children(
        ...SKIN_IDS.map((id) =>
          h.button.key(id).class("skin", model.form.skin === id && "on").attrs({ type: "button", "aria-label": skinOf(id).label, "aria-pressed": String(model.form.skin === id) })
            .on("click", HomeMessage.PickedSkin({ skin: id }))
            .children(FaceArt(h, { uid: `skin-${id}`, skin: id, mood: "happy", talking: false, accessory: null, gaze: [0, 0], blinking: false }))
        )
      ),

      h.h3("Your birthday"),
      h.p(`${profile.agentName} will celebrate with you.`),
      h.div.class("pair").children(
        h.select.attr("aria-label", "Birthday month").value(model.form.month).on("change", ({ value }) => HomeMessage.UpdatedBirthMonth({ value })).children(
          h.option.attr("value", "").children("Month"),
          ...MONTHS.map((label, i) => h.option.key(label).attr("value", String(i + 1).padStart(2, "0")).children(label))
        ),
        h.select.attr("aria-label", "Birthday day").value(model.form.day).on("change", ({ value }) => HomeMessage.UpdatedBirthDay({ value })).children(
          h.option.attr("value", "").children("Day"),
          ...DAYS.map((d) => h.option.key(d).attr("value", d).children(d))
        )
      ),

      h.h3("Time zone"),
      h.select.attr("aria-label", "Time zone").value(model.form.timezone).on("change", ({ value }) => HomeMessage.UpdatedTimezone({ value })).children(
        ...zones.map((z) => h.option.key(z).attr("value", z).children(z))
      ),

      h.button.class("btn", "primary", "wide").attrs({ type: "button" }).disabled(model.saving).on("click", HomeMessage.ClickedSaveSettings()).children(model.saving ? "Saving…" : "Save"),

      h.h3("Preferences"),
      h.label.class("toggle").children(
        "Speak replies out loud",
        h.input.attrs({ type: "checkbox" }).checked(model.speakOn).on("change", ({ checked }) => HomeMessage.ToggledSpeak({ checked }))
      ),
      h.label.class("toggle").children(
        "Seasonal effects",
        h.input.attrs({ type: "checkbox" }).checked(model.seasonOn).on("change", ({ checked }) => HomeMessage.ToggledSeason({ checked }))
      ),

      h.h3("Google calendar and mail"),
      h.p(profile.googleConnected ? "Connected. I can read your calendar and mail." : "Not connected."),
      h.div.class("pair").children(
        h.button.class("btn").attrs({ type: "button" }).on("click", HomeMessage.ClickedConnectGoogle()).children(profile.googleConnected ? "Reconnect" : "Connect Google"),
        profile.googleConnected && h.button.class("btn", "danger").attrs({ type: "button" }).on("click", HomeMessage.ClickedDisconnectGoogle()).children("Disconnect")
      ),

      h.h3("Automatic events"),
      h.p("Weekly events you approved in chat."),
      profile.autoRules.length === 0
        ? h.p(`None yet. Try: "add my Monday standup at 9 every week".`)
        : h.div.children(
          ...profile.autoRules.map((r) =>
            h.div.key(r.id).class("rule").children(
              h.span(`${r.title} · ${days[r.weekday] ?? ""} ${r.startTime} · ${r.durationMinutes} min`),
              h.button.class("btn", "danger").attrs({ type: "button" }).on("click", HomeMessage.ClickedRemoveRule({ id: r.id })).children("Remove")
            )
          )
        ),

      h.h3("Notifications"),
      h.p(model.pushNote || "Get a nudge when your brief is ready. On iPhone, add Juno to your home screen first."),
      h.div.class("pair").children(
        h.button.class("btn").attrs({ type: "button" }).on("click", HomeMessage.ClickedEnablePush()).children("Turn on"),
        h.button.class("btn").attrs({ type: "button" }).on("click", HomeMessage.ClickedTestPush()).children("Send a test")
      ),

      h.h3("Install"),
      h.p("iPhone: open in Safari, tap Share, then Add to Home Screen. Android: menu, then Install app."),

      h.div.class("pair", "end").children(
        h.button.class("btn", "danger").attrs({ type: "button" }).on("click", HomeMessage.ClickedSignOut()).children("Sign out"),
        h.button.class("btn", "primary").attrs({ type: "button" }).on("click", HomeMessage.RequestedCloseSheet()).children("Done")
      )
    )
  )
}
