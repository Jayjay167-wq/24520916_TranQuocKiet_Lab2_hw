# HW2 – Concurrent FIFO Audio Visualizer Queue Engine

## Run
```bash
npm install
npm run dev        # dev server
npm run typecheck  # TypeScript check
```

## Status
- [x] 2.1 Setup & design (`src/audio-task.ts`, `src/audio-queue-controller.ts`)
- [x] 2.2 FIFO queue controller (parallel fetch+decode, strict FIFO delivery)
- [x] 2.3 Web Audio engine (`src/audioEngine.ts`)
- [x] 2.4 Visualizer & memory safety (Visualizer, cancel(), stop/dispose)
- [ ] 2.5 Testing & delivery