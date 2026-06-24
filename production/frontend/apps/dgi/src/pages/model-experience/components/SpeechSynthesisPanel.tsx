import React, { useEffect, useRef, useState } from 'react'
import { Button, Empty, Input, Select, Spin, Tooltip, message } from 'antd'
import { DownloadOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import type { ModelItem } from './types'
import { useTransform } from '@/locales'
import { ModelLogo } from '@/components/model-card/ModelLogo'
import { useSystemConfig } from '@/hooks/use-system-config'
import { type ModelVoiceItem, apiModelVoiceList, apiSpeechSynthesis } from '@/services/api'
import type Transform from '@/locales/translation.json'
import { withApiPath } from '@/utils'

const { TextArea } = Input

/** 目标语言选项：前置「自动识别」 */
const withAutoDetectOption = (options: { label: string, value: string | number }[]) => [
  // { value: "", label: "自动识别" },
  ...options,
]

interface SpeechSynthesisPanelProps {
  models: ModelItem[]
  isFullscreen?: boolean
}

export const SpeechSynthesisPanel: React.FC<SpeechSynthesisPanelProps> = ({
  models,
  isFullscreen = false,
}) => {
  const { $t } = useTransform()
  const {
    voiceSceneOptions,
    voiceBizLanguageOptions,
    voiceGenderOptions,
    voiceAgeGroupOptions,
    voiceTargetLanguageOptions,
  } = useSystemConfig(true)

  const model = models[0]
  const modelName = model?.model_name ?? ''
  const modelId = model?.id

  const [sceneFilter, setSceneFilter] = useState<string>('all')
  const [langFilter, setLangFilter] = useState<string>('all')
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const [ageFilter, setAgeFilter] = useState<string>('all')
  const [synthesisText, setSynthesisText] = useState('')
  const [synthesisLang, setSynthesisLang] = useState<string>('') // 空为自动识别，或 VOICE_TARGET_LANGUAGE 的 key
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [synthesisDone, setSynthesisDone] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<ModelVoiceItem | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null)
  const [isResultPlaying, setIsResultPlaying] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const {
    data: voiceListData,
    loading: voiceListLoading,
    run: fetchVoiceList,
  } = useRequest(
    () => {
      if (!modelId) return Promise.resolve({ items: [], total: 0 })
      return apiModelVoiceList(modelId, {
        biz_language: langFilter === 'all' ? undefined : langFilter,
        scene: sceneFilter === 'all' ? undefined : sceneFilter,
        gender: genderFilter === 'all' ? undefined : genderFilter,
        age_group: ageFilter === 'all' ? undefined : ageFilter,
      }).then((res) => res?.data ?? { items: [], total: 0 })
    },
    {
      refreshDeps: [modelId, sceneFilter, langFilter, genderFilter, ageFilter],
      ready: !!modelId,
    },
  )

  const voiceList = voiceListData?.items ?? []

  // 默认选中第一个语言选项
  useEffect(() => {
    if (voiceTargetLanguageOptions.length > 0 && !synthesisLang) {
      setSynthesisLang(String(voiceTargetLanguageOptions[0].value))
    }
  }, [voiceTargetLanguageOptions])

  useEffect(() => {
    if (voiceList.length === 0) {
      setSelectedVoice(null)
      // 音色筛选为空时不清空已输入的合成文本
      return
    }
    const currentInList = selectedVoice && voiceList.some((v) => v.voice_id === selectedVoice.voice_id)
    if (!currentInList) {
      // 如果当前选中的角色不在列表中，清空选中状态，不自动选择第一个，但保留文字
      setSelectedVoice(null)
    }
  }, [voiceList])

  // 清空合成结果的辅助函数
  const clearSynthesisResult = () => {
    setAudioUrl(null)
    setSynthesisDone(false)
    setIsResultPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    // 停止正在播放的音频
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  const handleSynthesize = async () => {
    if (!synthesisText.trim()) {
      message.warning('请输入要合成的文本')
      return
    }
    if (!selectedVoice) {
      message.warning('请先选择音色')
      return
    }
    if (!modelName) {
      message.warning('未选择语音模型')
      return
    }
    setIsSynthesizing(true)
    setSynthesisDone(false)
    setAudioUrl(null)
    setCurrentTime(0)
    setDuration(0)
    setIsResultPlaying(false)
    try {
      const res = await apiSpeechSynthesis({
        model: modelName,
        mode: 'common',
        voice_id_list: [selectedVoice.voice_id],
        input_text: synthesisText.trim(),
        extra_params: synthesisLang ? { target_language: synthesisLang } : undefined,
      })
      // 响应格式: { code, message, data: { audio_url, md5 }, usage }
      const url = res?.data?.audio_url
      if (!url) {
        message.error((res as any)?.message ?? '合成失败，未返回音频地址')
        return
      }
      setAudioUrl(url)
      setSynthesisDone(true)
      setIsResultPlaying(false)
      message.success('合成完成')
    }
    catch (e: any) {
      message.error(e?.response?.data?.message ?? e?.message ?? '合成失败')
    }
    finally {
      setIsSynthesizing(false)
    }
  }

  const toggleResultPlayPause = () => {
    const el = audioRef.current
    if (!el || !audioUrl) return
    if (isResultPlaying) {
      el.pause()
      setIsResultPlaying(false)
    }
    else {
      el.play().then(() => setIsResultPlaying(true))
    }
  }

  // 处理进度条点击和拖拽
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current
    const bar = progressBarRef.current
    if (!el || !bar || !duration) return

    const rect = bar.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = percent * duration
    el.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleProgressClick(e)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const el = audioRef.current
      const bar = progressBarRef.current
      if (!el || !bar || !duration) return

      const rect = bar.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const newTime = percent * duration
      el.currentTime = newTime
      setCurrentTime(newTime)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, duration])

  const handleDownload = async () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `speech-${Date.now()}.wav`
    a.click()
  }

  return (
    <>
      <audio
        ref={previewAudioRef}
        onEnded={() => setPreviewVoiceId(null)}
        style={{ display: 'none' }}
      />
      <div
        className={`flex flex-1 min-h-0 overflow-hidden ${isFullscreen ? 'p-4' : 'px-6 py-4'}`}
      >
        <div className="flex gap-6 w-full mx-auto min-h-0 overflow-hidden flex-1">
          {/* 左侧：语音模型 + 声音角色筛选与列表 */}
          <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
            <div>
              <div className="text-sm text-gray-500 mb-4">
                {$t('语音模型' as keyof typeof Transform)}
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <ModelLogo name={model?.model_name} logo={model?.logo} size="large" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">{modelName}</span>
                      <span className="inline-block bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">
                        {$t('语音合成' as keyof typeof Transform)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {model?.description || '--'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-sm text-gray-500 mb-2">声音角色</div>
              {/* 场景 / 语言 / 性别 / 年龄 标签筛选，作为下方列表的入参 */}
              <div className="space-y-3 mb-3 flex-shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600 text-sm w-10 flex-shrink-0">场景</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${sceneFilter === 'all' ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                      onClick={() => {
                        setSceneFilter('all')
                        clearSynthesisResult()
                      }}
                    >
                      全部
                    </span>
                    {voiceSceneOptions.map((opt) => (
                      <span
                        key={opt.value}
                        className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${sceneFilter === opt.value ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                        onClick={() => {
                          setSceneFilter(String(opt.value))
                          clearSynthesisResult()
                        }}
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600 text-sm w-10 flex-shrink-0">语言</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${langFilter === 'all' ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                      onClick={() => {
                        setLangFilter('all')
                        clearSynthesisResult()
                      }}
                    >
                      全部
                    </span>
                    {voiceBizLanguageOptions.map((opt) => (
                      <span
                        key={opt.value}
                        className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${langFilter === opt.value ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                        onClick={() => {
                          setLangFilter(String(opt.value))
                          clearSynthesisResult()
                        }}
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600 text-sm w-10 flex-shrink-0">性别</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${genderFilter === 'all' ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                      onClick={() => {
                        setGenderFilter('all')
                        clearSynthesisResult()
                      }}
                    >
                      全部
                    </span>
                    {voiceGenderOptions.map((opt) => (
                      <span
                        key={opt.value}
                        className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${genderFilter === opt.value ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                        onClick={() => {
                          setGenderFilter(String(opt.value))
                          clearSynthesisResult()
                        }}
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600 text-sm w-10 flex-shrink-0">年龄</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${ageFilter === 'all' ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                      onClick={() => {
                        setAgeFilter('all')
                        clearSynthesisResult()
                      }}
                    >
                      全部
                    </span>
                    {voiceAgeGroupOptions.map((opt) => (
                      <span
                        key={opt.value}
                        className={`inline-block px-2.5 py-1 text-sm rounded-md cursor-pointer transition-colors ${ageFilter === opt.value ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
                        onClick={() => {
                          setAgeFilter(String(opt.value))
                          clearSynthesisResult()
                        }}
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Spin spinning={voiceListLoading}>
                <div className="flex-1 min-h-0 max-h-[calc(100vh-600px)] overflow-y-auto overflow-x-hidden pr-1">
                  {voiceList.length === 0 && !voiceListLoading ? (
                    <Empty description="暂无音色" className="py-8" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {voiceList.map((voice) => (
                        <div
                          key={voice.voice_id}
                          className={`border rounded-lg p-3 cursor-pointer transition-colors flex items-center gap-3 ${selectedVoice?.voice_id === voice.voice_id
                            ? 'border-blue-500 bg-blue-50/50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                          onClick={() => {
                            const isSameVoice = selectedVoice?.voice_id === voice.voice_id
                            setSelectedVoice(voice)
                            // 仅切换不同语音时用示例文案更新输入框并清空合成结果，同一语音保留用户已输入的文案
                            if (!isSameVoice) {
                              if (voice.sample_text) setSynthesisText(voice.sample_text)
                              clearSynthesisResult()
                            }
                          }}
                        >
                          <button
                            type="button"
                            className={`w-10 h-10 flex items-center justify-center rounded-full group flex-shrink-0 transition-colors relative ${previewVoiceId === voice.voice_id
                              ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-blue-500'
                            }`}
                            style={{
                              backgroundImage: voice.logo_url
                                ? `url(${withApiPath(voice.logo_url)})`
                                : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                            }}
                            title={previewVoiceId === voice.voice_id ? '停止' : '试听'}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!voice.sample_url) return
                              const el = previewAudioRef.current
                              if (!el) return
                              if (previewVoiceId === voice.voice_id) {
                                el.pause()
                                el.currentTime = 0
                                setPreviewVoiceId(null)
                              }
                              else {
                                el.src = voice.sample_url
                                el.play().then(() => setPreviewVoiceId(voice.voice_id))
                              }
                            }}
                          >
                            <span className={`hidden group-hover:block ${previewVoiceId === voice.voice_id ? 'text-blue-600 !block' : 'text-gray-500'}`}>
                              {previewVoiceId === voice.voice_id ? (
                                <PauseCircleOutlined className="text-lg relative z-10" />
                              ) : (
                                <PlayCircleOutlined className="text-lg relative z-10" />
                              )}
                            </span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{voice.voice_name}</div>
                            <div className="text-xs text-gray-500 line-clamp-2 mt-1">{voice.description}</div>
                          </div>
                          {previewVoiceId === voice.voice_id && (
                            <span className="text-xs text-blue-500 flex-shrink-0">播放中</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Spin>
            </div>
          </div>

          {/* 右侧：语音合成输入与结果 */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="text-lg font-medium text-gray-900 mb-4">
              {$t('语音合成' as keyof typeof Transform)}
              -
              {selectedVoice?.voice_name ?? ''}
            </div>
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <div>
                <TextArea
                  value={synthesisText}
                  onChange={(e) => setSynthesisText(e.target.value)}
                  placeholder="请输入要合成的文本"
                  autoSize={{ minRows: 4, maxRows: 8 }}
                  className="mb-3"
                />
                <div className="flex flex-wrap items-center gap-3 my-2">
                  <span className="text-gray-600">语言：</span>
                  <Select
                    value={synthesisLang}
                    onChange={setSynthesisLang}
                    options={withAutoDetectOption(voiceTargetLanguageOptions)}
                    className="w-28"
                  />
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleSynthesize}
                    loading={isSynthesizing}
                    disabled={!synthesisText.trim()}
                  >
                    {isSynthesizing ? '合成中' : '合成试听'}
                  </Button>
                </div>
                {/* <div className="text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded inline-block">
                点击后文案变更为合成中
              </div> */}
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-base font-medium text-gray-900 mb-2">合成结果</div>
                {!synthesisDone ? null : (
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${isResultPlaying
                          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-blue-500'
                        }`}
                        title={isResultPlaying ? '暂停' : '播放'}
                        onClick={toggleResultPlayPause}
                        disabled={!audioUrl}
                      >
                        {isResultPlaying ? (
                          <PauseCircleOutlined className="text-xl" />
                        ) : (
                          <PlayCircleOutlined className="text-xl" />
                        )}
                      </button>
                      <span className="font-medium">{selectedVoice?.voice_name ?? ''}</span>
                      {isResultPlaying && (
                        <span className="text-xs text-blue-500 flex-shrink-0">播放中</span>
                      )}
                      <div className="flex-1 flex items-center gap-2">
                        <div
                          ref={progressBarRef}
                          className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden cursor-pointer relative group"
                          onMouseDown={handleProgressMouseDown}
                        >
                          <div
                            className={`h-full bg-blue-500 ${isDragging ? '' : 'transition-[width]'}`}
                            style={{ width: duration ? `${(currentTime / duration) * 100}%` : 0 }}
                          />
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full transition-opacity ${isDragging || 'group-hover:opacity-100'} ${isDragging ? 'opacity-100' : 'opacity-0'}`}
                            style={{
                              left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : 0,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 tabular-nums">
                          00:
                          {String(Math.floor(currentTime)).padStart(2, '0')}
                          /
                          00:
                          {String(Math.floor(duration)).padStart(2, '0')}
                        </span>
                      </div>
                      <Button
                        type="text"
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                        disabled={!audioUrl}
                      />
                    </div>
                    <audio
                      ref={audioRef}
                      src={audioUrl ?? undefined}
                      onTimeUpdate={(e) => {
                        if (!isDragging) {
                          setCurrentTime(e.currentTarget.currentTime)
                        }
                      }}
                      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                      onPlay={() => setIsResultPlaying(true)}
                      onPause={() => setIsResultPlaying(false)}
                      onEnded={() => setIsResultPlaying(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default SpeechSynthesisPanel
