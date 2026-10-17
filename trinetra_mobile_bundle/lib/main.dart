import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

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
  late final WebViewController _controller;
  int _loadingProgress = 0;
  bool _hasError = false;
  String _errorMessage = '';
  String _currentUrl = 'http://10.0.2.2:8088/farmer-app.html';

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  void _initWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0F172A))
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _loadingProgress = progress;
            });
          },
          onPageStarted: (String url) {
            setState(() {
              _hasError = false;
              _loadingProgress = 0;
            });
          },
          onPageFinished: (String url) {
            setState(() {
              _loadingProgress = 100;
            });
          },
          onWebResourceError: (WebResourceError error) {
            // If server isn't reached, show fallback options
            if (error.isForMainFrame ?? true) {
              setState(() {
                _hasError = true;
                _errorMessage = error.description;
              });
            }
          },
        ),
      );

    _loadAppUrl(_currentUrl);
  }

  void _loadAppUrl(String url) {
    setState(() {
      _currentUrl = url;
      _hasError = false;
    });
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
              'Enter Backend Server URL (Local or Cloud):',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: textController,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xFF0F172A),
                hintText: 'http://10.0.2.2:8088/farmer-app.html',
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
                  label: const Text('Emulator (10.0.2.2)'),
                  onPressed: () {
                    textController.text = 'http://10.0.2.2:8088/farmer-app.html';
                  },
                ),
                ActionChip(
                  label: const Text('Localhost'),
                  onPressed: () {
                    textController.text = 'http://localhost:8088/farmer-app.html';
                  },
                ),
                ActionChip(
                  label: const Text('Bundled Offline Asset'),
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
            child: const Text('కనెక్ట్ చేయి (Connect)'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF15803D),
        elevation: 2,
        title: Row(
          children: [
            Image.asset(
              'assets/trinetra-logo.png',
              width: 32,
              height: 32,
              errorBuilder: (context, error, stackTrace) => const Icon(
                Icons.agriculture,
                color: Colors.white,
                size: 28,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TRINETRA DRONES',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8,
                    ),
                  ),
                  Text(
                    'రైతు డ్రోన్ బుకింగ్ యాప్ (Andhra Pradesh)',
                    style: TextStyle(
                      color: Color(0xFFBBF7D0),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            tooltip: 'Reload App',
            onPressed: () => _controller.reload(),
          ),
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white),
            tooltip: 'Server Settings',
            onPressed: _showServerConfigDialog,
          ),
        ],
      ),
      body: Stack(
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
                      Icons.cloud_off_rounded,
                      size: 64,
                      color: Color(0xFFF87171),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'సర్వర్ కనెక్షన్ లభించలేదు\n(Backend Server Connection Failed)',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _errorMessage.isNotEmpty
                          ? _errorMessage
                          : 'Please ensure Trinetra backend server is running on port 8088.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
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
                          label: const Text('తిరిగి ప్రయత్నించు (Retry)'),
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
                          icon: const Icon(Icons.storage),
                          label: const Text('ఆఫ్‌లైన్ మోడ్ (Offline)'),
                          onPressed: () =>
                              _loadAppUrl('assets/farmer-app.html'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _showServerConfigDialog,
                      child: const Text(
                        'సర్వర్ IP మార్చండి (Change Server URL)',
                        style: TextStyle(color: Color(0xFF86EFAC)),
                      ),
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
    );
  }
}
