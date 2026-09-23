import { useIonRouter } from "@ionic/vue";

export function useAppNavigation() {
    const ionRouter = useIonRouter()

    function goBackOrFallback(fallback: string) {
        if (ionRouter.canGoBack()) {
            ionRouter.back()
        } else {
            ionRouter.navigate(fallback, 'back', 'replace')
        }
    }

    return {
        ionRouter,
        goBackOrFallback,
    }
}