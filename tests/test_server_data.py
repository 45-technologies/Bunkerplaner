import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

ECB = b"""<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube><Cube time='2026-10-15'><Cube currency='USD' rate='1.1208'/><Cube currency='CHF' rate='0.9305'/></Cube></Cube></gesmes:Envelope>"""
ALT = json.dumps({'date': '2026-10-15', 'eur': {'usd': 1.12, 'cop': 3582.85, 'ars': 1698.4, 'bad': -1, 'xx1': 3}}).encode()
POWER = json.dumps({'properties': {'parameter': {'T2M': {m: float(i) for i, m in enumerate(server.MONTHS)} | {'ANN': 5.5}}}}).encode()


class ServerDataTests(unittest.TestCase):
    def setUp(self):
        server.memory.clear()
        self.orig = server.remote

    def tearDown(self):
        server.remote = self.orig
        server.memory.clear()

    def test_exchange_rates_ecb_overrides_alternative(self):
        server.remote = lambda url, max_bytes=0: ECB if 'ecb.europa.eu' in url else ALT
        r = server.exchange_rates()
        self.assertEqual(r['rates']['USD'], 1.1208)       # EZB vor currency-api
        self.assertEqual(r['rates']['COP'], 3582.85)      # nur in currency-api
        self.assertNotIn('BAD', r['rates'])
        self.assertNotIn('XX1', r['rates'])
        self.assertEqual(r['rates']['EUR'], 1.0)
        self.assertEqual(r['date'], '2026-10-15')
        self.assertTrue(r['src'].startswith('EZB'))

    def test_exchange_rates_fail_without_sources(self):
        def boom(url, max_bytes=0):
            raise OSError('offline')
        server.remote = boom
        with self.assertRaises(ValueError):
            server.exchange_rates()

    def test_climate_monthly_means(self):
        server.remote = lambda url, max_bytes=0: POWER
        r = server.climate(52.5, 13.4)
        self.assertEqual(r['temps'], [float(i) for i in range(12)])
        self.assertIn('NASA POWER', r['source'])
        with self.assertRaises(ValueError):
            server.climate(95, 0)

    def test_climate_incomplete(self):
        server.remote = lambda url, max_bytes=0: json.dumps({'properties': {'parameter': {'T2M': {'JAN': 1}}}}).encode()
        with self.assertRaises(ValueError):
            server.climate(10, 10)

    def test_seismic_us_design_values(self):
        seen = []
        body = json.dumps({'request': {'status': 'success'}, 'response': {'data': {'sds': 1.04, 'sd1': 0.62, 'pgam': 0.71, 'sms': 1.56, 'sm1': 0.93, 'tl': 8, 'sdc': 'D', 'ss': 2.1}}}).encode()
        server.remote = lambda url, max_bytes=0: (seen.append(url), body)[1]
        r = server.seismic_us(34.05, -118.25, 'III', 'D')
        self.assertEqual((r['sds'], r['sd1'], r['sdc'], r['pgam'], r['tl']), (1.04, 0.62, 'D', 0.71, 8))
        self.assertIn('asce7-22.json', seen[0])
        self.assertIn('riskCategory=III', seen[0])
        self.assertIn('siteClass=D', seen[0])
        with self.assertRaises(ValueError):
            server.seismic_us(34, -118, 'V', 'D')
        with self.assertRaises(ValueError):
            server.seismic_us(34, -118, 'II', 'Z')

    def test_seismic_us_no_data(self):
        server.remote = lambda url, max_bytes=0: json.dumps({'response': {'data': {'sds': None}}}).encode()
        with self.assertRaises(ValueError):
            server.seismic_us(52.5, 13.4, 'II', 'Default')

    def test_forms_only_from_register(self):
        urls = server.form_urls()
        self.assertIn('https://www.stmb.bayern.de/assets/stmi/buw/baurechtundtechnik/24_anlage-01_bauantrag.pdf', urls)
        self.assertTrue(all(u.startswith('https://') for u in urls))
        orig = server.remote_meta
        try:
            server.remote_meta = lambda url, max_bytes: (b'%PDF-1.7 test', {'last-modified': 'Mon, 01 Sep 2026 10:00:00 GMT', 'content-type': 'application/pdf'})
            r = server.form_check('https://www.stmb.bayern.de/assets/stmi/buw/baurechtundtechnik/24_anlage-01_bauantrag.pdf')
            self.assertTrue(r['pdf'])
            self.assertEqual(r['size'], 13)
            self.assertEqual(len(r['sha256']), 64)
            self.assertEqual(server.form_get('https://www.stmb.bayern.de/assets/stmi/buw/baurechtundtechnik/24_anlage-01_bauantrag.pdf'), b'%PDF-1.7 test')
            with self.assertRaises(ValueError):
                server.form_get('https://example.com/evil.pdf')
            server.remote_meta = lambda url, max_bytes: (b'<html>', {})
            with self.assertRaises(ValueError):
                server.form_get('https://www.stmb.bayern.de/assets/stmi/buw/baurechtundtechnik/24_anlage-01_bauantrag.pdf')
        finally:
            server.remote_meta = orig


if __name__ == '__main__':
    unittest.main()
