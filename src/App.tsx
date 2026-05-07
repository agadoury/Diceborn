import { Routes, Route, Navigate } from "react-router-dom";
import MainMenu from "./components/screens/MainMenu";
import PlayStub from "./components/screens/PlayStub";
import DevTokens from "./components/screens/DevTokens";
import DevComponentsStub from "./components/screens/DevComponentsStub";

export default function App() {
  return (
    <Routes>
      <Route path="/"               element={<MainMenu />} />
      <Route path="/play"           element={<PlayStub />} />
      <Route path="/dev/tokens"     element={<DevTokens />} />
      <Route path="/dev/components" element={<DevComponentsStub />} />
      <Route path="*"               element={<Navigate to="/" replace />} />
    </Routes>
  );
}
