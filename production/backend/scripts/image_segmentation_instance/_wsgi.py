import argparse
import json
import logging.config
import os
import sys

# 当 demo 移到外部独立运行时，当前目录不是包，需加入 path 才能导入同目录模块
_wsgi_dir = os.path.dirname(os.path.abspath(__file__))
if _wsgi_dir not in sys.path:
    sys.path.insert(0, _wsgi_dir)
from custom_predict import PlatformLabelStudio

logging.config.dictConfig({
  "version": 1,
  "disable_existing_loggers": False,
  "formatters": {
    "standard": {
      "format": "[%(asctime)s] [%(levelname)s] [%(name)s::%(funcName)s::%(lineno)d] %(message)s"
    }
  },
  "handlers": {
    "console": {
      "class": "logging.StreamHandler",
      "level": os.getenv('LOG_LEVEL'),
      "stream": "ext://sys.stdout",
      "formatter": "standard"
    }
  },
  "root": {
    "level": os.getenv('LOG_LEVEL'),
    "handlers": [
      "console"
    ],
    "propagate": True
  }
})

from label_studio_ml.api import init_app

_DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')
_DEFAULT_MODEL_DIR = '/data/models'


def get_kwargs_from_config(config_path=_DEFAULT_CONFIG_PATH):
    if not os.path.exists(config_path):
        return dict()
    with open(config_path) as f:
        config = json.load(f)
    assert isinstance(config, dict)
    return config


def is_gunicorn_preload_enabled():
    argv = " ".join(sys.argv)
    return "gunicorn" in os.path.basename(sys.argv[0]) and "--preload" in argv


def preload_model(kwargs):
    if os.getenv('PRELOAD_MODEL', 'true').lower() in ('0', 'false', 'no'):
        return

    if is_gunicorn_preload_enabled():
        logging.getLogger(__name__).warning(
            'Skip model preload in Gunicorn master because NPU runtime is not fork-safe. '
            'Start Gunicorn without --preload so workers preload the model safely.'
        )
        return

    logging.getLogger(__name__).info(
        'Preloading %s before serving requests..',
        PlatformLabelStudio.__name__,
    )
    PlatformLabelStudio(**dict(kwargs))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Label studio')
    parser.add_argument(
        '-p', '--port', dest='port', type=int, default=9090,
        help='Server port')
    parser.add_argument(
        '--host', dest='host', type=str, default='0.0.0.0',
        help='Server host')
    parser.add_argument(
        '--kwargs', '--with', dest='kwargs', metavar='KEY=VAL', nargs='+', type=lambda kv: kv.split('='),
        help='Additional LabelStudioMLBase model initialization kwargs')
    parser.add_argument(
        '-d', '--debug', dest='debug', action='store_true',
        help='Switch debug mode')
    parser.add_argument(
        '--log-level', dest='log_level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], default="DEBUG",
        help='Logging level')
    parser.add_argument(
        '--model-dir', dest='model_dir', default=os.path.dirname(__file__),
        help='Directory where models are stored (relative to the project directory)')
    parser.add_argument(
        '--check', dest='check', action='store_true',
        help='Validate model instance before launching server')
    parser.add_argument('--basic-auth-user',
                        default=os.environ.get('ML_SERVER_BASIC_AUTH_USER', None),
                        help='Basic auth user')
    
    parser.add_argument('--basic-auth-pass',
                        default=os.environ.get('ML_SERVER_BASIC_AUTH_PASS', None),
                        help='Basic auth pass')    
    
    args = parser.parse_args()

    # setup logging level
    if args.log_level:
        logging.root.setLevel(args.log_level)

    def isfloat(value):
        try:
            float(value)
            return True
        except ValueError:
            return False

    def parse_kwargs():
        param = dict()
        for k, v in args.kwargs:
            if v.isdigit():
                param[k] = int(v)
            elif v == 'True' or v == 'true':
                param[k] = True
            elif v == 'False' or v == 'false':
                param[k] = False
            elif isfloat(v):
                param[k] = float(v)
            else:
                param[k] = v
        return param

    kwargs = get_kwargs_from_config()

    if args.kwargs:
        kwargs.update(parse_kwargs())

    if args.check:
        print('Check "' + PlatformLabelStudio.__name__ + '" instance creation..')
    preload_model(kwargs)

    app = init_app(model_class=PlatformLabelStudio, basic_auth_user=args.basic_auth_user, basic_auth_pass=args.basic_auth_pass)

    app.run(host=args.host, port=args.port, debug=args.debug)

elif __name__ != "__mp_main__":
    # for uWSGI/Gunicorn use
    _kwargs = get_kwargs_from_config()
    _kwargs.setdefault("model_dir", os.getenv("MODEL_DIR", _DEFAULT_MODEL_DIR))
    preload_model(_kwargs)
    app = init_app(model_class=PlatformLabelStudio)
