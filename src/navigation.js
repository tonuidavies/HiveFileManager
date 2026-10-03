import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, BackHandler, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);

export const ScreenContext = createContext({ focused: true });
export const useScreen = () => useContext(ScreenContext);

/**
 * Back handler that is only active while the screen is on top.
 * Handlers registered later run first (Android BackHandler order), so the top screen wins.
 */
export function useBackHandler(handler) {
  const { focused } = useScreen();
  const ref = useRef(handler);
  const focusedRef = useRef(focused);
  ref.current = handler;
  focusedRef.current = focused;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (focusedRef.current ? !!ref.current() : false));
    return () => sub.remove();
  }, []);
}

/** Slide/fade-in wrapper for pushed screens. Hidden screens stay mounted (state + scroll are kept). */
export function ScreenContainer({ focused, animate, children, bg, fullBleed }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (animate) Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim, animate]);
  return (
    <ScreenContext.Provider value={{ focused }}>
      <Animated.View
        pointerEvents={focused ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: bg },
          // Keep content (and the banner ad) above the system navigation bar / gesture area.
          // Top is handled by each screen's header. Full-bleed screens (photo viewer) manage their own.
          !fullBleed && { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
          !focused && styles.hidden,
          {
            opacity: anim,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </ScreenContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
});
