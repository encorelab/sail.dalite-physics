if __FILE__ == $PROGRAM_NAME
  require 'rubygems'
  load 'config.rb'
end

require 'rest_client'
require 'uri'
require 'mongo'

require 'model'

require 'ruby-debug'

$: << 'sail.rb/lib'
require 'sail/agent'


class Inquisitor < Sail::Agent
  def initialize(opts = {})
    @run_id = opts[:run_id] || ENV['RUN_ID']
    raise ArgumentError, "No run_id specified!" unless @run_id
    opts[:room] = "run-#{@run_id}"
    
    super(opts)

    #@rollcall = RestClient::Resource.new("http://rollcall.proto.encorelab.org")
    #@rollcall = RestClient::Resource.new("http://localhost:3000")
    
    @mongo = Mongo::Connection.new.db('dalite-physics')
    
    @arlo = RestClient::Resource.new(ENV['ARLO_URL'])
  end
  
  def logic
    when_ready do
      pres = Blather::Stanza::Presence::Status.new
      pres.to = agent_jid_in_room
      pres.state = :chat
      
      log "Joining #{agent_jid_in_room.inspect}..."
      
      client.write(pres)
      groupchat_logger_ready!
    end
  
    event :joined? do |stanza, payload|
      login = Util.extract_login(payload['who'] || stanza.from)
      
      begin
        u = User.find(login)
        user_joined(u)
      rescue ActiveResource::ResourceNotFound => e
        log "Login is #{login}"
        g = Group.find(login)
        group_joined(g)
      end
    end
    
    event :question_answered? do |stanza, payload|
      answers = @mongo['answers']
      
      login = Util.extract_login(stanza.from)
      
      u = User.find(login)
      
      a = {
        :run_id => @run_id,
        :question_id => payload['questionID'],
        :tags => payload['chosenTags'],
        :choice => payload['choice'],
        :rationale => payload['rationale'],
        :timestamp => Time.now,
        :user => {
          :id => u.id,
          :login => u.account.login,
          :jid => stanza.from.to_s
        }
      }
      
      answers.insert(a)
      
      u.question_answered!(payload['questionID'])
      u.reload
      
      do_homework(u)
    end
    
    event :group_question_answered? do |stanza, payload|
      answers = @mongo['answers']
      
      #gid = payload['groupID']
      #g = Group.find(gid)
      
      login = Util.extract_login(stanza.from)
      
      g = nil
      begin
        g = Group.find(login)
      rescue ActiveResource::ResourceNotFound
        log "#{login} is not a group... ignoring", :WARN
      end

      if g

      a = {
        :run_id => @run_id,
        :question_id => payload['questionID'],
        :tags => payload['chosenTags'],
        :question_url => payload['questionURL'],
        :correct => payload['answeredCorrectly'] == true || payload['answeredCorrectly'] == 'true',
        :choice => payload['groupAnswer'] || payload['choice'],
        :rationale => payload['rationale'],
        :timestamp => Time.now,
        :group => {
          :id => g.id,
          :login => g.account.login,
          :jid => stanza.from.to_s
        }
      }
      
      answers.insert(a)
      
      g.question_answered!(payload['questionID'])
      g.reload
      
      do_groupwork(g)
      end      
    end
    
    event :done? do |stanza, payload|
      login = Util.extract_login(stanza.from)
      
      u = User.find(login)
      
      u.homework_completed!
    end
    
    # event :question_assigned? do |stanza, payload|
    #       
    #     end
    
    message :error? do |err|
      log "\n\n\n"
      log "!" * 80
      log "GOT ERROR MESSAGE: #{err.inspect}"
      log "!" * 80
    end
    
    disconnected do
      # automatically reconnect
      log "DISCONNECTED!"
      log "attempting to reconnect..."
      client.connect
    end
  end
  
  
  protected
  
  def user_joined(u)
    log "#{u} joined!"
    
    if u.kind == 'Student'
      if u.homework_completed?
        log "#{u} has already completed the homework section."
      else
        log "#{u} has not yet completed the homework section."

        unless u.is_already_in_expertise_group?
          log "#{u} is not yet in an expertise group... will randomly assign one..."
          u.randomly_assign_to_expertise_group!
          u.reload
          exp_group = u.current_expertise_group
          log "#{u} is now in expertise group: #{u.current_expertise_group}"
        end

        do_homework(u)
      end
    else
      log "#{u} is not a student... ignoring."
    end
  end
  
  def group_joined(g)
    log "#{g} joined"
    
    do_groupwork(g)
  end
  
  
  def do_homework(u)
    answers = @mongo['answers']
    past_answers = answers.find('user.id' => u.id)
    
    log "#{u} has so far answered #{past_answers.count} questions"
    
    if past_answers.count >= 5
      event!(:done, {}, :to => u.jid)
    else
      last_id = u.last_unanswered_question_id
    
      if last_id
        q = JSON.parse(@arlo['questions/'+last_id+'.json'].get)['question']
        unless q
          log "question #{last_id.inspect} was not found in the CMS!", :ERROR
        end
        log "#{u} is on question #{q['id']}"
      else
        q = randomly_pick_unanswered_question_for_user(u)
      end
    
      assign_question(u, q)
    end
  end
  
  
  def do_groupwork(g)
    question_id_to_assign = nil
    
    if g.has_assigned_list_of_questions?
      log "#{g} already has the following questions assigned: #{g.assigned_list_of_questions.inspect}"
      
      last_id = g.last_unanswered_question_id
      
      if last_id
        log "#{g} will resume at question #{last_id.inspect}"
        question_id_to_assign = last_id
      else
        question_id_to_assign = randomly_pick_unanswered_question_for_group_from_list_of_assigned_questions(g)
      end
    else
      log "#{g} doesn't yet have any questions assigned..."
      question_ids = randomly_pick_unanswered_questions_for_group(g)
      g.assign_list_of_questions!(question_ids)
      log "The following questions were assigned to #{g}: #{question_ids.inspect}"
      
      question_id_to_assign = question_ids[rand(question_ids.size)]
    end
    
    if question_id_to_assign == :done
      log "#{g} have answered all of their questions!"
      event!(:done, {}, :to => g.jid)
    elsif question_id_to_assign.blank? # should never happen
      log "Couldn't come up with a question to assign to #{g}!", :ERROR
    else
      q = nil
      begin
        q = JSON.parse(@arlo["questions/#{question_id_to_assign}.json"].get)['question']
      rescue => e
        log "Couldn't retrieve question #{question_id_to_assign} from Arlo! #{e}", :ERROR
      end
    
      assign_question(g, q) if q
    end
  end
  
  
  def randomly_pick_unanswered_question_for_user(u)    
    answers = @mongo['answers']
    past_answers = answers.find('user.id' => u.id)
    
    exp = u.current_expertise_group
  
    log "Randomly selecting a new question for #{u} from #{exp}"
  
    query = "Question.find(:all, :conditions => {:expertise_id => #{exp.id}})"
    
    begin
      questions = JSON.parse(@arlo['query.json?query='+CGI.escape(query)].get)['payload'].
        collect{|q| q['question']}
    rescue => e
      log "Error while querying CMS for questions in expertise ID #{exp.id.inspect}!: #{e}", :ERROR
    end
  
    answered_ids = past_answers.collect{|pa| pa['question_id'].to_i}
    unanswered_questions = questions.select{|q| not answered_ids.include? q['id'].to_i}
    
    if unanswered_questions.empty?
      log "#{u} has no more questions left to answer!", :ERROR
    end
    
    return unanswered_questions.sort_by{rand}.first
  end
  
  def randomly_pick_unanswered_question_for_group_from_list_of_assigned_questions(g)    
    answers = @mongo['answers']
    past_answers = answers.find('group.id' => g.id)
    
    assigned_ids = g.assigned_list_of_questions
  
    answered_ids = past_answers.collect{|pa| pa['question_id'].to_i}
    unanswered_question_ids = assigned_ids.select{|qid| not answered_ids.include? qid.to_i}
    
    log "#{g} has the following questions left to answer: #{unanswered_question_ids.inspect}"
    if unanswered_question_ids.empty?
      return :done
    else
      return unanswered_question_ids.sort_by{rand}.first
    end
  end
  
  def randomly_pick_unanswered_questions_for_group(g)
    student_ids = g.members.collect{|m| m.id}
    
    # get the ids of the questions that students in this group answered individually (in the homework section)
    answered_question_ids = @mongo['answers'].find('user.id' => {'$in' => student_ids}).
      map{|a| a['question_id'].to_i}
  
    # fetch the list of all questions
    all_questions = JSON.parse(@arlo['questions.json'].get).collect{|q| q['question']}
    
    # filter out any questions that have been answered by any of the group's students
    unanswered_questions = all_questions.reject{|q| answered_question_ids.include? q['id'].to_i}
    
    # organize the unanswerd questions by expertise
    unanswered_questions_by_expertise = {}
    unanswered_questions.each do |q|
      unanswered_questions_by_expertise[q['expertise_id']] ||= []
      unanswered_questions_by_expertise[q['expertise_id']] << q
    end
    
    new_question_ids = []
    # pick a random (unanswered) question from each expertise
    unanswered_questions_by_expertise.keys.each do |key|
      qs = unanswered_questions_by_expertise[key]
      if qs.empty?
        log "No unanswered questions left in expertise #{exp} for #{g}!", :ERROR
      else
        new_question_ids << qs[rand(qs.size)]['id']
      end
    end
    
    return new_question_ids
  end
  
  def assign_question(u_or_g, q)
    # {"eventType":"question_assigned",
    #   "payload":{"questionID":"15",
    #   "questionURL":"http://www.theredpin.com/images/widgets/HomepageSampleProjectSimple/cinema_tower_featured.jpg",
    #   "tags":["Newton","Gravity","Intertia"],
    #   "choices":["A","B","C"]}}
    
    query = "Question.find(#{q['id']}).tags"
    tags = JSON.parse(@arlo['query.json?query='+CGI.escape(query)].get)['payload'].
         collect{|t| t['tag']}
    
    choices = ('A'..q['choice_limit']).to_a
    
    answers = @mongo['answers']
    past_answers = answers.find('question_id' => q['id'].to_s).collect do |pa|
      {'rationale' => pa['rationale'], 'tags' => pa['tags'], 'choice' => pa['choice']}
    end
    
    data = {
      'questionID' => q['id'],
      'questionURL' => ENV['ARLO_URL'] + q['image_path'],
      'tags' => tags.collect{|t| t['name']},
      'choices' => choices,
      'past_answers' => past_answers
    }
    
    event!(:question_assigned, data, :to => u_or_g.jid)
    
    u_or_g.question_assigned!(q['id'])
    
    log "Assigned question #{q['id'].inspect} to #{u_or_g}."
  end
  
end

if __FILE__ == $PROGRAM_NAME
  load 'config.rb'
  i = Inquisitor.new
  i.vitalize
  i.run_em
end
