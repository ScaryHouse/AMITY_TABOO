# Accessibility and Install Decisions

## Browser mode is installer mode

Until AMITY TABOO is launched from the Home Screen, the browser version is only an installer.

The install card should stay direct:

- AMITY TABOO branding.
- A friendly game of Taboo.
- Add to your Home Screen.
- Platform-specific install instructions.

Browser mode must not expose game play:

- No card navigation.
- No shuffle.
- No saved-deck bypass.
- No continue-to-game action.
- No screen-reader game controls.

This keeps the install experience predictable and prevents old saved sessions from leaking game controls into the browser.

## Home Screen mode is game mode

When the app is opened from the Home Screen, the install card is skipped and the game can load normally.

This matches the intended mental model: browser equals installer, Home Screen equals game.

## VoiceOver install flow

Web apps cannot reliably detect whether VoiceOver is enabled. The install card itself is therefore the first focusable VoiceOver control instead of trying to infer screen-reader use.

The first invisible focusable control identifies the app once, then asks:

> AMITY TABOO. A friendly game of Taboo. Are you using a screen reader? Double tap yes to use screen reader controls for AMITY TABOO.

The visible install instructions are hidden from VoiceOver so the screen reader does not jump to the visual heading or landmark. If the install card is activated, the app saves that choice on the device, changes the same focusable card to a repeat-instructions control, and reads the full platform-specific install instructions once. The repeat label is:

> Repeat install instructions. Double tap to hear the instructions again.

Sighted users do not see this button. They read the visible instructions directly on the install card.

## Platform-specific instructions

The install card stays on one page, but the written and spoken instructions can vary by browser and platform:

- iPhone Safari: show the iOS Home Screen steps.
- iPhone non-Safari browser: show the Safari handoff steps first, then the iOS Home Screen steps.
- Android browser: show the Android Home Screen steps.

## Screen-reader game controls

VoiceOver uses swipe left and swipe right for normal focus navigation, and double tap to activate the focused item. The game should not rely on those gestures as hidden custom controls for blind players.

For a screen-reader game interface, expose explicit controls such as:

- Repeat current card.
- Previous card.
- Next card.
- Shuffle deck.

Those controls should appear only when the app is actually in game mode.
