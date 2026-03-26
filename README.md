Virtual Library: Collaborative Pomodoro & Social Accountability
A real-time, multiplayer deep-work environment designed to combat remote-work isolation through shared responsibility.

Live Production Environment
https://virtual-library-g4dt.vercel.app/

Technical Overview
Virtual Library is a full-stack web application that introduces a "Social Contract" to the Pomodoro technique. By linking multiple users to a shared session, the application creates a collective stake: if any participant loses focus (defined by tab visibility or window closure), the session terminates for the entire group.

Core Features
Real-time Synchronization: Leverages Firestore Snapshots for sub-second latency in timer and participant state syncing.

Social Accountability Logic: Integrated Page Visibility API to detect distractions and trigger "session wither" states across all connected clients.

Live Focus Feeds: Dynamic participant mapping allowing users to declare specific work goals (e.g., "Refactoring Auth Logic") to foster a co-working atmosphere.

Role-Based Access Control (RBAC): Granular permissions allowing room hosts to manage capacity, lock sessions, and moderate participants.

User Analytics: Persistent tracking of focus minutes, daily streaks, and completion rates via Firebase Authentication and Firestore Transactions.

Architecture & Tech Stack
Frontend: React 18 (Hooks, Context, useMemo for performance optimization)

Build Tool: Vite (Optimized for fast HMR and production builds)

Backend-as-a-Service: Firebase

Firestore: NoSQL Database for real-time document streaming.

Authentication: Google OAuth 2.0.

Security: Strict Server-Side Security Rules for data isolation.

UI/UX: CSS-in-JS / Standard CSS with a focus on Glassmorphism and responsive design.

Infrastructure: Vercel (CI/CD Pipeline).

System Design Challenges
1. Atomic State Management
To prevent race conditions during simultaneous "Join" requests, the application utilizes Firestore Transactions. This ensures that room capacity and participant arrays are updated safely without overwriting concurrent data.

2. Tab Visibility Integrity
The primary challenge was ensuring the "Social Contract" remained enforced. I implemented event listeners on the visibilitychange document state, which pushes a status update to the shared Firestore document, immediately triggering a UI state change and an audio "failure" cue for all other peers.

3. Case-Sensitive Deployment
Navigating the transition from case-insensitive local development (macOS) to case-sensitive production environments (Linux/Vercel) required manual Git index refactoring to ensure component resolution parity.

Local Development
Clone the repository.

Run npm install.

Configure .env with Firebase API keys (API Key, Auth Domain, Project ID).

Execute npm run dev.
