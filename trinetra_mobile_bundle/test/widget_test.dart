import 'package:flutter_test/flutter_test.dart';

import 'package:trinetra_farmer_app/main.dart';

void main() {
  testWidgets('TrinetraFarmerApp smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const TrinetraFarmerApp());

    // Verify app bar title displays
    expect(find.text('TRINETRA DRONES'), findsOneWidget);
  });
}
