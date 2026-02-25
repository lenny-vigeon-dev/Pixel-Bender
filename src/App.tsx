
import { MainLayout } from './components/layout/MainLayout';
import { ImageProcessor } from './components/features/ImageProcessor';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { GoalSection } from './components/features/GoalSection';
import { DisclaimerSection } from './components/features/DisclaimerSection';

function App() {
  return (
    <MainLayout>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 flex flex-col gap-8">
        <ImageProcessor />
        <DisclaimerSection />
        <GoalSection />
      </main>
      <Footer />
    </MainLayout>
  )
}

export default App
