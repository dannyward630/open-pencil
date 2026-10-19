import { describe, expect, test } from 'bun:test'

import { matchKeyBindingPress, parseKeybinding } from 'tinykeys'

import { editorCommandMetadata } from '#vue/editor/commands/registry'
import { formatShortcut, shortcutPlatform } from '#vue/editor/commands/shortcut'
import type { EditorCommandId } from '#vue/editor/commands/types'

const applePlatform = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

function historyCommandMatches(
  command: EditorCommandId,
  key: string,
  code: string,
  shiftKey = false
): boolean {
  const event = {
    key,
    code,
    getModifierState: (modifier: string) =>
      modifier === 'Meta'
        ? applePlatform
        : modifier === 'Control'
          ? !applePlatform
          : modifier === 'Shift'
            ? shiftKey
            : false
  } as KeyboardEvent
  return [editorCommandMetadata(command).keybinding ?? []].flat().some((keybinding) => {
    const press = parseKeybinding(keybinding)[0]
    return press !== undefined && matchKeyBindingPress(event, press)
  })
}

describe('formatShortcut', () => {
  test('formats shortcuts for macOS', () => {
    expect(formatShortcut('MOD+D', 'mac')).toBe('⌘D')
    expect(formatShortcut('MOD+SHIFT+H', 'mac')).toBe('⇧⌘H')
    expect(formatShortcut('MOD+ALT+K', 'mac')).toBe('⌥⌘K')
    expect(formatShortcut('SHIFT+A', 'mac')).toBe('⇧A')
  })

  test('formats shortcuts for Windows and Linux', () => {
    expect(formatShortcut('MOD+D', 'windows')).toBe('Ctrl+D')
    expect(formatShortcut('MOD+SHIFT+H', 'windows')).toBe('Ctrl+Shift+H')
    expect(formatShortcut('MOD+ALT+K', 'linux')).toBe('Ctrl+Alt+K')
    expect(formatShortcut('SHIFT+A', 'linux')).toBe('Shift+A')
  })

  test('detects platform from user agent', () => {
    expect(shortcutPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac')
    expect(shortcutPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(shortcutPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })
})

describe('history command keybindings', () => {
  test('undo follows the Z character on QWERTZ layouts', () => {
    expect(historyCommandMatches('edit.undo', 'z', 'KeyY')).toBe(true)
    expect(historyCommandMatches('edit.undo', 'y', 'KeyZ')).toBe(false)
  })

  test('redo follows the Z and Y characters on QWERTZ layouts', () => {
    expect(historyCommandMatches('edit.redo', 'Z', 'KeyY', true)).toBe(true)
    expect(historyCommandMatches('edit.redo', 'y', 'KeyZ')).toBe(true)
  })

  test('undo still matches the standard QWERTY Z position', () => {
    expect(historyCommandMatches('edit.undo', 'z', 'KeyZ')).toBe(true)
  })
})
