#!/usr/bin/env python3
"""
Celery Worker启动文件
用于启动Celery Worker进程
"""
from pathlib import Path
import sys
import multiprocessing  # 用于获取CPU核数
sys.path.insert(0, str(Path(__file__).parent))
from app.tasks.celery_app import celery_app
import argparse


def main():
    parser = argparse.ArgumentParser(description='Celery Worker启动')
    # 默认并发数设为CPU核数，以充分利用多核性能
    parser.add_argument('--concurrency', type=int, default=1)
    # parser.add_argument('--concurrency', type=int, default=multiprocessing.cpu_count(), 
    #                    help=f'Worker并发数 (默认: {multiprocessing.cpu_count()})')
    parser.add_argument('--log-level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], 
                       default='INFO', help='日志级别 (默认: INFO)')
    parser.add_argument('--queues', default='default', help='监听的队列 (默认: default)')
    args = parser.parse_args()
   
    try:
        # 启动Celery Worker
        celery_app.worker_main([
            'worker',
            f'--loglevel={args.log_level.lower()}',
            f'--concurrency={args.concurrency}',
            f'--queues={args.queues}',
            '--without-gossip',  # 禁用gossip协议，减少日志噪音
            '--without-mingle',  # 禁用mingle，减少启动时间
            '--pool=solo' if args.concurrency == 1 else '--pool=prefork',  # 单进程时使用solo池
        ])
    except Exception as e:
        print(f"Worker 启动失败: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
    