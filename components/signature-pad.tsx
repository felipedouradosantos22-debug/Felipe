import { useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

type Point = { x: number; y: number };
export type SignatureStroke = Point[];

interface SignaturePadProps {
  onChange: (strokes: SignatureStroke[]) => void;
}

function toPath(points: Point[]) {
  if (!points.length) return "";
  return points.reduce(
    (path, point, index) => `${path}${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)} `,
    "",
  );
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const activeStroke = useRef<number | null>(null);

  const updateStrokes = (next: SignatureStroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    onChange(next);
  };

  /* eslint-disable react-hooks/refs -- PanResponder callbacks read refs only after render. */
  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const next = [...strokesRef.current, [{ x: locationX, y: locationY }]];
        activeStroke.current = next.length - 1;
        updateStrokes(next);
      },
      onPanResponderMove: (event) => {
        const index = activeStroke.current;
        if (index === null) return;
        const { locationX, locationY } = event.nativeEvent;
        const next = strokesRef.current.map((stroke, strokeIndex) =>
          strokeIndex === index ? [...stroke, { x: locationX, y: locationY }] : stroke,
        );
        updateStrokes(next);
      },
      onPanResponderRelease: () => {
        activeStroke.current = null;
      },
      onPanResponderTerminate: () => {
        activeStroke.current = null;
      },
    }),
  );
  /* eslint-enable react-hooks/refs */

  return (
    <View>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        <Svg width="100%" height="100%" pointerEvents="none">
          {strokes.map((stroke, index) => (
            <Path
              key={`signature-stroke-${index}`}
              d={toPath(stroke)}
              fill="none"
              stroke="#0C5666"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {strokes.length === 0 ? (
          <Text pointerEvents="none" style={styles.placeholder}>
            Assine aqui com o dedo
          </Text>
        ) : null}
        <View pointerEvents="none" style={styles.baseline} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Limpar assinatura"
        onPress={() => updateStrokes([])}
        style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
      >
        <Text style={styles.clearText}>Limpar assinatura</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: 142,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D3E0E3",
    backgroundColor: "#FBFDFD",
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#91A2A6",
    fontSize: 14,
  },
  baseline: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#C9D9DC",
  },
  clearButton: {
    alignSelf: "flex-end",
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  clearText: {
    color: "#0C5666",
    fontSize: 12,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.65,
  },
});
