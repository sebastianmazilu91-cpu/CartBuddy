import { Pressable, StyleSheet, Text } from 'react-native';

type ChipButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function ChipButton({ label, selected, onPress }: ChipButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#64748b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0b1220',
  },
  chipSelected: {
    borderColor: '#84cc16',
    backgroundColor: '#365314',
  },
  chipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#ecfccb',
  },
});
