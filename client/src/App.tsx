import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { loadSession } from "./session.ts";
import { AuthPage } from "./pages/Auth.tsx";
import { Landing } from "./pages/Landing.tsx";
import { Lobby } from "./pages/Lobby.tsx";
import { Play } from "./pages/Play.tsx";
import { RoomLobby } from "./pages/RoomLobby.tsx";

function Guard({ children }: { children: ReactNode }) {
  return loadSession() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="app-bg">
      <div className="grain" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          path="/lobby"
          element={
            <Guard>
              <Lobby />
            </Guard>
          }
        />
        <Route
          path="/table/:id"
          element={
            <Guard>
              <RoomLobby />
            </Guard>
          }
        />
        <Route
          path="/play/:id"
          element={
            <Guard>
              <Play />
            </Guard>
          }
        />
      </Routes>
    </div>
  );
}
