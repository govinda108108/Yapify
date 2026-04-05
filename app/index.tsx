import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

export default function YapifyScreen() {
  return (
    <>
      <StatusBar hidden />
      <WebView
        style={styles.webview}
        source={require('../assets/yapify-v0.1.html')}
        javaScriptEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onPermissionRequest={req => req.grant(req.resources)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#0e1012' },
});
