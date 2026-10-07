"""HTTP integration tests use a fake model; CUDA inference remains device acceptance."""
import os
import unittest
from unittest.mock import patch
os.environ['QUBE_SPEECH_TOKEN'] = 'a' * 64
try:
    from fastapi.testclient import TestClient
    import server
except ImportError:
    TestClient = None

@unittest.skipIf(TestClient is None, 'Install FastAPI and httpx for HTTP integration tests')
class SpeechApiTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.headers = {'Authorization': 'Bearer ' + 'a' * 64}
    def test_authentication(self):
        self.assertEqual(self.client.get('/health').status_code, 401)
        self.assertEqual(self.client.get('/health', headers=self.headers).status_code, 200)
    def test_invalid_and_oversized_audio(self):
        for payload, status in [(b'',400),(bytes(3201),400),(bytes(1920002),413)]:
            response = self.client.post('/transcribe', content=payload, headers=self.headers)
            self.assertEqual(response.status_code,status)
    def test_transcription_and_model_failure(self):
        with patch.object(server, 'infer', return_value='打开夜间模式'):
            response=self.client.post('/transcribe',content=bytes(32000),headers=self.headers)
            self.assertEqual(response.json(), {'text':'打开夜间模式'})
        with patch.object(server, 'infer', side_effect=RuntimeError('CUDA absent')):
            self.assertEqual(self.client.post('/transcribe',content=bytes(32000),headers=self.headers).status_code,503)

    def test_keyword_conversion_and_validation(self):
        response = self.client.post('/keywords', json={'phrase':'小机小机'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['tokens'], 'x iǎo j ī x iǎo j ī @小机小机')
        for phrase in ['a', 'a b c', '这是一个过长的唤醒词']:
            self.assertEqual(self.client.post('/keywords', json={'phrase':phrase}, headers=self.headers).status_code, 400)
