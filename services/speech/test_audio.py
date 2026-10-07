import unittest
from audio import validate_pcm, MAX_BYTES

class AudioTest(unittest.TestCase):
    def test_valid_frame(self):
        self.assertEqual(len(validate_pcm(bytes(32000))), 32000)
    def test_invalid_lengths(self):
        for size in [0, 3198, 3201, MAX_BYTES + 2]:
            with self.assertRaises(ValueError):
                validate_pcm(bytes(size))
if __name__ == "__main__":
    unittest.main()
