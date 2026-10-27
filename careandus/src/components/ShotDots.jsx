export default function ShotDots({ shots, current, done }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${done.length}/${shots.length}`}>
      {shots.map((s) => {
        const isDone = done.includes(s);
        const isCur = s === current;
        return (
          <span
            key={s}
            className={`block h-2.5 rounded-full transition-all ${isCur ? 'w-8 bg-plum' : 'w-2.5'} ${isDone && !isCur ? 'bg-clay' : ''} ${
              !isDone && !isCur ? 'bg-line' : ''
            }`}
          />
        );
      })}
    </div>
  );
}
