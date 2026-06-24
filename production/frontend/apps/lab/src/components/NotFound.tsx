import { Button, Result } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import ProjectLayout from '@/layouts/ProjectLayout'

const NotFound = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const errorPage = (
    <Result
      status="404"
      title="404"
      subTitle="你访问的页面不存在。"
      extra={(
        <>
          <Button type="primary" onClick={() => navigate(-1)}>
            返回
          </Button>
          <Button type="default" onClick={() => navigate('/home')}>
            返回首页
          </Button>
        </>
      )}
    />
  )

  console.log('location.pathname', location.pathname)

  if (location.pathname.match(/\/project\/\d+\//)) {
    return (
      <ProjectLayout>
        {errorPage}
      </ProjectLayout>
    )
  }
  return errorPage
}

export default NotFound
