import { useState, type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

type Props = Omit<TextInputProps, 'defaultValue'> & { ref?: Ref<TextInput> };

/** Typed texts the screen hasn't echoed back yet; more than this and it isn't listening. */
const MAX_PENDING = 30;

/**
 * A TextInput with the usual `value` / `onChangeText` API that leaves the text to the native box.
 *
 * Sheets render through <SheetHost>, so a sheet's `value` reaches its input a render or more after
 * the keystroke. A controlled TextInput pushes that stale text back to the native view, and when
 * typing mid-text the cursor lands before the letter just typed. Here `value` only seeds the box.
 * Every typed text is remembered until `value` catches up with it, so late echoes are ignored, and
 * the box is given new text (remounted) only for a value it never held: a reset or a clear.
 *
 * Callers should validate on save rather than filter keystrokes: a rejected keystroke leaves
 * `value` unchanged, so the box would keep showing it.
 */
export function TextField({ value, onChangeText, onFocus, onBlur, autoFocus, ref, ...rest }: Props) {
  const text = value ?? '';
  const [prevText, setPrevText] = useState(text);
  const [pending, setPending] = useState<string[]>([]);
  // The text the native box was last given, and a remount counter for giving it new text.
  const [seed, setSeed] = useState(text);
  const [generation, setGeneration] = useState(0);
  const [focused, setFocused] = useState(false);

  if (text !== prevText) {
    setPrevText(text);
    const echo = pending.indexOf(text);
    if (echo >= 0) {
      setPending(pending.slice(echo + 1));
    } else {
      // Not something typed, and not what the box held before (that was prevText): new text.
      setPending([]);
      setSeed(text);
      setGeneration((g) => g + 1);
    }
  }

  return (
    <TextInput
      key={generation}
      {...rest}
      ref={ref}
      defaultValue={seed}
      // Keep the keyboard up if the text was replaced while typing.
      autoFocus={autoFocus || (generation > 0 && focused)}
      onChangeText={(t) => {
        setPending((p) => [...p.slice(1 - MAX_PENDING), t]);
        onChangeText?.(t);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}
