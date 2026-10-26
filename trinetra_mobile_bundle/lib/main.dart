import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF15803D), // Emerald 700
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const TrinetraFarmerApp());
}

class TrinetraFarmerApp extends StatelessWidget {
  const TrinetraFarmerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trinetra Drones — Agriculture Drone Booking',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF16A34A),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const FarmerWebViewPage(),
    );
  }
}

class FarmerWebViewPage extends StatefulWidget {
  const FarmerWebViewPage({super.key});

  @override
  State<FarmerWebViewPage> createState() => _FarmerWebViewPageState();
}

class _FarmerWebViewPageState extends State<FarmerWebViewPage> {
  static const String defaultCloudUrl =
      'https://trinetra-farmer-app.onrender.com/farmer-app.html';
  static const String prefUrlKey = 'trinetra_saved_backend_url';

  late final WebViewController _controller;
  int _loadingProgress = 0;
  bool _hasError = false;
  String _errorMessage = '';
  String _currentUrl = defaultCloudUrl;
  Timer? _autoRetryTimer;
  int _retryCountdown = 0;

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  @override
  void dispose() {
    _autoRetryTimer?.cancel();
    super.dispose();
  }

  Future<void> _initWebView() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final String savedUrl = prefs.getString(prefUrlKey) ?? defaultCloudUrl;

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8FAFC))
      ..clearCache()
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _loadingProgress = progress;
            });
          },
          onPageStarted: (String url) {
            _autoRetryTimer?.cancel();
            setState(() {
              _hasError = false;
              _loadingProgress = 0;
            });
          },
          onPageFinished: (String url) {
            _autoRetryTimer?.cancel();
            setState(() {
              _loadingProgress = 100;
              _hasError = false;
            });
          },
          onNavigationRequest: (NavigationRequest request) {
            final String rawUrl = request.url;
            final String lowerUrl = rawUrl.toLowerCase();
            if (lowerUrl == 'trinetra:settings' || lowerUrl == 'action:settings') {
              _showServerConfigDialog();
              return NavigationDecision.prevent;
            }
            if (lowerUrl == 'trinetra:reload' || lowerUrl == 'action:reload') {
              _controller.reload();
              return NavigationDecision.prevent;
            }
            if (lowerUrl.startsWith('tel:') ||
                lowerUrl.startsWith('mailto:') ||
                lowerUrl.startsWith('sms:') ||
                lowerUrl.startsWith('whatsapp:') ||
                lowerUrl.startsWith('upi:') ||
                lowerUrl.startsWith('geo:') ||
                lowerUrl.startsWith('intent:') ||
                lowerUrl.contains('maps.google.com') ||
                lowerUrl.contains('google.com/maps')) {
              _launchExternalScheme(rawUrl);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onWebResourceError: (WebResourceError error) {
            final String desc = error.description.toUpperCase();
            final String? errUrl = error.url?.toLowerCase();
            if (desc.contains('ERR_UNKNOWN_URL_SCHEME') ||
                desc.contains('NET::ERR_UNKNOWN_URL_SCHEME') ||
                (errUrl != null &&
                    (errUrl.startsWith('tel:') ||
                     errUrl.startsWith('mailto:') ||
                     errUrl.startsWith('sms:') ||
                     errUrl.startsWith('intent:') ||
                     errUrl.startsWith('geo:') ||
                     errUrl.startsWith('whatsapp:') ||
                     errUrl.startsWith('trinetra:') ||
                     errUrl.startsWith('action:') ||
                     errUrl.contains('google.com/maps')))) {
              return;
            }
            if (error.isForMainFrame ?? true) {
              setState(() {
                _hasError = true;
                _errorMessage = error.description;
              });
              _scheduleAutoRetry();
            }
          },
        ),
      );

    _loadAppUrl(savedUrl, saveToPrefs: false);
  }

  void _scheduleAutoRetry() {
    _autoRetryTimer?.cancel();
    _retryCountdown = 4;
    _autoRetryTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _retryCountdown--;
      });
      if (_retryCountdown <= 0) {
        timer.cancel();
        if (_hasError) {
          _controller.reload();
        }
      }
    });
  }

  
  Future<void> _launchExternalScheme(String rawUrl) async {
    try {
      String targetUrl = rawUrl;
      if (rawUrl.startsWith('intent:')) {
        final RegExp browserFallback = RegExp(r'browser_fallback_url=([^;]+)');
        final matchFallback = browserFallback.firstMatch(rawUrl);
        if (matchFallback != null) {
          targetUrl = Uri.decodeComponent(matchFallback.group(1)!);
        } else {
          final RegExp urlRegex = RegExp(r'intent://([^#]+)');
          final matchUrl = urlRegex.firstMatch(rawUrl);
          if (matchUrl != null) {
            final path = matchUrl.group(1)!;
            targetUrl = 'https://$path';
          }
        }
      }

      final Uri uri = Uri.parse(targetUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
    } catch (e) {
      debugPrint('[Trinetra] Error launching external URL $rawUrl: $e');
    }
  }

  

  Future<void> _loadAppUrl(String url, {bool saveToPrefs = true}) async {
    _autoRetryTimer?.cancel();
    setState(() {
      _currentUrl = url;
      _hasError = false;
      _loadingProgress = 0;
    });

    if (saveToPrefs) {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(prefUrlKey, url);
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      _controller.loadRequest(Uri.parse(url));
    } else {
      _controller.loadFlutterAsset(url);
    }
  }

  void _showServerConfigDialog() {
    final TextEditingController textController =
        TextEditingController(text: _currentUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'సర్వర్ సెట్టింగులు (Server Settings)',
          style: TextStyle(color: Colors.white, fontSize: 16),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Backend Server URL (Permanently Saved):',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: textController,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xFF0F172A),
                hintText: defaultCloudUrl,
                hintStyle: const TextStyle(color: Colors.white38),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                ActionChip(
                  label: const Text('24/7 Render Cloud'),
                  onPressed: () {
                    textController.text = defaultCloudUrl;
                  },
                ),
                ActionChip(
                  label: const Text('Offline Local Asset'),
                  onPressed: () {
                    textController.text = 'assets/farmer-app.html';
                  },
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('రద్దు (Cancel)'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF16A34A),
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _loadAppUrl(textController.text.trim());
            },
            child: const Text('సేవ్ చేయి (Save & Connect)'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF15803D),
        body: SafeArea(
          child: Stack(
          children: [
            if (!_hasError)
              WebViewWidget(controller: _controller)
            else
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.cloud_sync_rounded,
                        size: 64,
                        color: Color(0xFF38BDF8),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'క్లౌడ్ సర్వర్‌తో కనెక్ట్ అవుతోంది...\n(Connecting to 24/7 Cloud Server...)',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _retryCountdown > 0
                          ? 'Auto-reconnecting in $_retryCountdown seconds...'
                          : 'Reconnecting now...',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFF86EFAC),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (_errorMessage.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6.0),
                          child: Text(
                            _errorMessage,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white38,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF16A34A),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                            ),
                            icon: const Icon(Icons.refresh),
                            label: const Text('రీకనెక్ట్ (Reconnect)'),
                            onPressed: () => _loadAppUrl(_currentUrl),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white38),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                            ),
                            icon: const Icon(Icons.offline_bolt),
                            label: const Text('ఆఫ్‌లైన్ (Offline Mode)'),
                            onPressed: () =>
                                _loadAppUrl('assets/farmer-app.html', saveToPrefs: false),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.settings, color: Colors.white70),
                            tooltip: 'Settings',
                            onPressed: _showServerConfigDialog,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            if (_loadingProgress < 100 && !_hasError)
              LinearProgressIndicator(
                value: _loadingProgress / 100.0,
                backgroundColor: Colors.transparent,
                valueColor: const AlwaysStoppedAnimation<Color>(
                  Color(0xFF22C55E),
                ),
              ),
          ],
        ),
        ),
      ),
    );
  }
}
