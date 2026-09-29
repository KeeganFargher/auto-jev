export function PickLayer({ onPick }: { onPick: (clientX: number, clientY: number) => void }) {
  return <div className="board-pick" onClick={(event) => onPick(event.clientX, event.clientY)} />;
}
